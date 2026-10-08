import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { CatchmentGeometryService } from "./catchment-geometry.service";
import {
  CATCHMENT_CONTACT,
  CATCHMENT_SUFFIX,
  PARISH_DEFAULTS,
  SERVING_CATCHMENT,
} from "./polyclinic-routing";

export interface CatchmentResolution {
  polyclinic: string;
  programmeCode: string;
  /**
   * The serving catchment's single contact line (name + phone + email) to show
   * on the confirmation page and in the applicant email. Optional because the
   * SQS message boundary may carry a resolution from an older deploy mid-rollout —
   * callers optional-chain and fall back to the shared all-clinics list. `resolve()`
   * always sets it (boot validation guarantees a row for every serving catchment).
   */
  polyclinicContact?: string;
}

interface CatchmentEntry {
  /** GeoJSON `properties.name` — the geographic catchment the polygons cover. */
  name: string;
  /**
   * Polyclinic whose Environmental Health Department serves this catchment —
   * `name` itself unless `SERVING_CATCHMENT` redirects it. Everything the
   * applicant and the Ministry see (the code, the inbox, the name on the
   * confirmation page) comes from this, never from `name`.
   */
  servedBy: string;
}

/**
 * A per-catchment lookup table must cover every serving catchment and name
 * nothing else — catching both a typo'd key and a key left behind for a
 * catchment now served by another polyclinic. Shared by every such table
 * (`CATCHMENT_SUFFIX`, `CATCHMENT_CONTACT`) so a new one gets both halves of
 * the check rather than only the one its author remembered.
 */
function assertKeyedByServingCatchments(
  table: Record<string, string>,
  servingNames: Set<string>,
  label: string,
): void {
  for (const name of servingNames) {
    if (!(name in table)) {
      throw new Error(
        `[catchment] ${label} has no entry for catchment "${name}"`,
      );
    }
  }
  for (const name of Object.keys(table)) {
    if (!servingNames.has(name)) {
      throw new Error(
        `[catchment] ${label} has an entry for unknown catchment "${name}"`,
      );
    }
  }
}

@Injectable()
export class CatchmentRoutingService implements OnModuleInit {
  private readonly logger = new Logger(CatchmentRoutingService.name);
  private byName = new Map<string, CatchmentEntry>();

  constructor(private readonly geometry: CatchmentGeometryService) {}

  onModuleInit(): void {
    const entries = this.geometry.dataset.features.map((f) => {
      const name = f.properties.name;
      const servedBy = SERVING_CATCHMENT[name] ?? name;
      return {
        name,
        servedBy,
      };
    });

    this.byName = new Map(entries.map((e) => [e.name, e]));

    // Structural validation of our own data — fail loud.
    for (const [parish, target] of Object.entries(PARISH_DEFAULTS)) {
      if (!this.byName.has(target)) {
        throw new Error(
          `[catchment] PARISH_DEFAULTS["${parish}"] → unknown catchment "${target}"`,
        );
      }
    }

    // A redirect must point from one real catchment to another, and the target
    // must not itself be redirected — a chain would silently stop one hop
    // short and route to a polyclinic that no longer serves the area.
    for (const [from, to] of Object.entries(SERVING_CATCHMENT)) {
      if (!this.byName.has(from)) {
        throw new Error(
          `[catchment] SERVING_CATCHMENT has an entry for unknown catchment "${from}"`,
        );
      }
      if (!this.byName.has(to)) {
        throw new Error(
          `[catchment] SERVING_CATCHMENT["${from}"] → unknown catchment "${to}"`,
        );
      }
      if (to in SERVING_CATCHMENT) {
        throw new Error(
          `[catchment] SERVING_CATCHMENT["${from}"] → "${to}", which is itself redirected — chains are not followed`,
        );
      }
    }

    const servingNames = new Set(entries.map((e) => e.servedBy));

    // Programme codes are composed from the recipe's own programmeCode plus a
    // per-catchment suffix, so the suffix table must cover every serving
    // catchment and name nothing else.
    assertKeyedByServingCatchments(
      CATCHMENT_SUFFIX,
      servingNames,
      "CATCHMENT_SUFFIX",
    );

    // Every serving catchment must also carry a contact line — a live
    // submission routed to a catchment with no line would show a blank contact
    // section (#254).
    assertKeyedByServingCatchments(
      CATCHMENT_CONTACT,
      servingNames,
      "CATCHMENT_CONTACT",
    );
  }

  resolve(input: {
    formId: string;
    /**
     * The recipe's own webhook `mapping.programmeCode`, which the per-catchment
     * code is composed from. Undefined when the recipe declares
     * `catchmentRouting` but no mapped webhook — the recipe loader rejects that
     * at boot, so this is the belt to that braces.
     */
    programmeCode?: string;
    coordinates?: string;
    parish?: string;
  }): CatchmentResolution | null {
    const hit = this.pointHit(input.coordinates);
    const entry = hit ?? this.parishHit(input.parish);
    if (!entry) return null;
    const programmeCode = this.programmeCodeFor(
      input.programmeCode,
      entry.servedBy,
    );
    if (!programmeCode) {
      // No fallback code is invented here: returning null makes the caller's
      // resolvedCatchment undefined, so the webhook falls back to the
      // recipe's own mapping.programmeCode and catchment.mdaEmail fails
      // loudly — resolveCatchmentRecipient finds no recipient, the !recipient
      // guard throws NonRetryableError, and sqs-consumer.service.ts logs it
      // and deletes the message rather than letting it churn into the DLQ —
      // rather than misrouting. This file's existing fail-loud stance.
      //
      // Composition means this now fires only when the recipe carries no
      // mapped webhook, or the catchment has no suffix — both of which boot
      // validation already refuses to start with. It is unreachable in
      // practice and kept as the guard that makes that true.
      this.logger.error(
        `[catchment] no programme code for form "${input.formId}" / catchment "${entry.servedBy}"`,
      );
      return null;
    }
    return {
      polyclinic: entry.servedBy,
      programmeCode,
      polyclinicContact: this.contactFor(entry.servedBy),
    };
  }

  /**
   * The single contact line for one serving catchment, read from
   * `CATCHMENT_CONTACT`. Boot validation guarantees every serving catchment has
   * a row, so a resolved resolution always yields a line — a miss here is a
   * programming/configuration error, so it fails the submission loudly rather
   * than emitting a blank or misleading contact section.
   */
  private contactFor(servingCatchment: string): string {
    const contact = CATCHMENT_CONTACT[servingCatchment];
    if (contact === undefined) {
      throw new Error(
        `[catchment] no contact line for serving catchment "${servingCatchment}"`,
      );
    }
    return contact;
  }

  /**
   * The CMS programme code for one form in one serving catchment: the recipe's
   * own `mapping.programmeCode` plus the catchment suffix. Composing is what
   * makes a new catchment-routed form cost nothing in `polyclinic-routing.ts` —
   * the recipe already carries its programme code, and the suffixes are shared.
   */
  private programmeCodeFor(
    programmeCode: string | undefined,
    servingCatchment: string,
  ): string | null {
    const suffix = CATCHMENT_SUFFIX[servingCatchment];
    if (!programmeCode || !suffix) return null;
    return `${programmeCode}_${suffix}`;
  }

  private parishHit(parish?: string): CatchmentEntry | undefined {
    if (!parish) return undefined;
    const name = PARISH_DEFAULTS[parish];
    return name ? this.byName.get(name) : undefined;
  }

  private pointHit(coordinates?: string): CatchmentEntry | undefined {
    if (!coordinates) return undefined;
    const parts = coordinates.split(",");
    if (parts.length !== 2) return undefined;
    const lat = Number(parts[0]);
    const lng = Number(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
    const hit = this.geometry.findContaining(lat, lng);
    return hit ? this.byName.get(hit.properties.name) : undefined;
  }
}
