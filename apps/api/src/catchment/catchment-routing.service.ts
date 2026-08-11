import * as fs from "node:fs";
import * as path from "node:path";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  PARISH_DEFAULTS,
  POLYCLINIC_EMAILS,
  PROGRAMME_CODES_BY_FORM,
} from "./polyclinic-routing";

export interface CatchmentResolution {
  polyclinic: string;
  programmeCode: string;
  /** Null when the Ministry email for this catchment is not yet known. */
  mdaEmail: string | null;
}

/** GeoJSON ring: an array of [lng, lat] pairs. */
type Ring = [number, number][];
/** Polygon: [outerRing, ...holes]. MultiPolygon: [Polygon, ...]. */
interface CatchmentEntry {
  name: string;
  email: string | null;
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
      // Emails live in POLYCLINIC_EMAILS (not the GeoJSON). A catchment with no
      // entry resolves to null and is reported by the boot warn below.
      return {
        name,
        email: POLYCLINIC_EMAILS[name] ?? null,
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

    // Every form's programme-code map must cover every GeoJSON catchment, and
    // every key in it must name a real GeoJSON catchment (catches a typo'd
    // key that the old, catchment-only check could not).
    for (const [formId, codesByCatchment] of Object.entries(
      PROGRAMME_CODES_BY_FORM,
    )) {
      for (const entry of this.entries) {
        if (!(entry.name in codesByCatchment)) {
          throw new Error(
            `[catchment] form "${formId}" has no programme code for catchment "${entry.name}"`,
          );
        }
      }
      for (const catchmentName of Object.keys(codesByCatchment)) {
        if (!this.byName.has(catchmentName)) {
          throw new Error(
            `[catchment] form "${formId}" has a programme code for unknown catchment "${catchmentName}"`,
          );
        }
      }
    }

    // Ministry email gap — warn, do not fail boot.
    const noEmail = this.entries.filter((e) => !e.email).map((e) => e.name);
    if (noEmail.length > 0) {
      this.logger.warn(
        `[catchment] no Ministry email for: ${noEmail.join(", ")} — a coordinate hit there fails the MDA email until supplied`,
      );
    }
  }

  resolve(input: {
    formId: string;
    coordinates?: string;
    parish?: string;
  }): CatchmentResolution | null {
    const hit = this.pointHit(input.coordinates);
    const entry = hit ?? this.parishHit(input.parish);
    if (!entry) return null;
    const programmeCode = PROGRAMME_CODES_BY_FORM[input.formId]?.[entry.name];
    if (!programmeCode) {
      // No fallback code is invented here: returning null makes the caller's
      // resolvedCatchment undefined, so the webhook falls back to the
      // recipe's own mapping.programmeCode and catchment.mdaEmail fails
      // loudly — resolveCatchmentRecipient finds no recipient, the !recipient
      // guard throws NonRetryableError, and sqs-consumer.service.ts logs it
      // and deletes the message rather than letting it churn into the DLQ —
      // rather than misrouting. This file's existing fail-loud stance, now
      // applied per form as well as per catchment.
      this.logger.error(
        `[catchment] no programme code for form "${input.formId}" / catchment "${entry.name}"`,
      );
      return null;
    }
    return {
      polyclinic: entry.name,
      programmeCode,
      mdaEmail: entry.email,
    };
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
