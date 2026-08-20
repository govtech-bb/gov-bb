import * as fs from "node:fs";
import * as path from "node:path";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  CATCHMENT_SUFFIX,
  PARISH_DEFAULTS,
  PROGRAMME_CODE_OVERRIDES,
  SERVING_CATCHMENT,
} from "./polyclinic-routing";

export interface CatchmentResolution {
  polyclinic: string;
  programmeCode: string;
}

/** GeoJSON ring: an array of [lng, lat] pairs. */
type Ring = [number, number][];
/** Polygon: [outerRing, ...holes]. MultiPolygon: [Polygon, ...]. */
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
  /** Normalised to a list of polygons, each polygon a list of rings. */
  polygons: Ring[][];
}

@Injectable()
export class CatchmentRoutingService implements OnModuleInit {
  private readonly logger = new Logger(CatchmentRoutingService.name);
  private entries: CatchmentEntry[] = [];
  private byName = new Map<string, CatchmentEntry>();

  onModuleInit(): void {
    const file = path.resolve(__dirname, "polyclinic-catchments.geojson");
    const geojson = JSON.parse(fs.readFileSync(file, "utf8")) as {
      features: {
        properties: { name: string };
        geometry: { type: string; coordinates: unknown };
      }[];
    };

    this.entries = geojson.features.map((f) => {
      const name = f.properties.name;
      const servedBy = SERVING_CATCHMENT[name] ?? name;
      return {
        name,
        servedBy,
        polygons: this.normalisePolygons(f.geometry),
      };
    });

    this.byName = new Map(this.entries.map((e) => [e.name, e]));

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

    const servingNames = new Set(this.entries.map((e) => e.servedBy));

    // Programme codes are composed from the recipe's own programmeCode plus a
    // per-catchment suffix, so the suffix table must cover every serving
    // catchment and name nothing else (catches both a typo'd key and a key left
    // behind for a catchment that is now served by another polyclinic).
    for (const name of servingNames) {
      if (!(name in CATCHMENT_SUFFIX)) {
        throw new Error(
          `[catchment] CATCHMENT_SUFFIX has no suffix for catchment "${name}"`,
        );
      }
    }
    for (const name of Object.keys(CATCHMENT_SUFFIX)) {
      if (!servingNames.has(name)) {
        throw new Error(
          `[catchment] CATCHMENT_SUFFIX has a suffix for unknown catchment "${name}"`,
        );
      }
    }

    // An override records an off-convention CMS queue. One naming a catchment
    // that is no longer served would silently stop applying, so fail loud —
    // a stale override must be deleted, not left to rot. (That its formId names
    // a real catchment-routed recipe is asserted in the spec, which can read
    // the recipes directory; this service deliberately knows nothing of them.)
    for (const [formId, byCatchment] of Object.entries(
      PROGRAMME_CODE_OVERRIDES,
    )) {
      for (const name of Object.keys(byCatchment)) {
        if (!servingNames.has(name)) {
          throw new Error(
            `[catchment] PROGRAMME_CODE_OVERRIDES["${formId}"] has a code for unknown catchment "${name}"`,
          );
        }
      }
    }
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
      input.formId,
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
    };
  }

  /**
   * The CMS programme code for one form in one serving catchment: the override
   * if the CMS issued an off-convention code, otherwise the recipe's own
   * `mapping.programmeCode` plus the catchment suffix. Composing is what makes
   * a new catchment-routed form cost nothing in `polyclinic-routing.ts` — the
   * recipe already carries its programme code, and the suffixes are shared.
   */
  private programmeCodeFor(
    formId: string,
    programmeCode: string | undefined,
    servingCatchment: string,
  ): string | null {
    const override = PROGRAMME_CODE_OVERRIDES[formId]?.[servingCatchment];
    if (override) return override;
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
    return this.entries.find((e) => this.inCatchment(lng, lat, e));
  }

  private inCatchment(lng: number, lat: number, e: CatchmentEntry): boolean {
    return e.polygons.some((poly) => this.inPolygon(lng, lat, poly));
  }

  /** Polygon = [outer, ...holes]. Inside outer and not inside any hole. */
  private inPolygon(lng: number, lat: number, polygon: Ring[]): boolean {
    if (polygon.length === 0) return false;
    if (!this.inRing(lng, lat, polygon[0])) return false;
    for (let i = 1; i < polygon.length; i++) {
      if (this.inRing(lng, lat, polygon[i])) return false;
    }
    return true;
  }

  /** Ray-cast point-in-ring (ring points are [lng, lat]). */
  private inRing(lng: number, lat: number, ring: Ring): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      if (
        yi > lat !== yj > lat &&
        lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
      ) {
        inside = !inside;
      }
    }
    return inside;
  }

  private normalisePolygons(geometry: {
    type: string;
    coordinates: unknown;
  }): Ring[][] {
    if (geometry.type === "Polygon") {
      return [geometry.coordinates as Ring[]];
    }
    if (geometry.type === "MultiPolygon") {
      return geometry.coordinates as Ring[][];
    }
    throw new Error(`[catchment] unsupported geometry type "${geometry.type}"`);
  }
}
