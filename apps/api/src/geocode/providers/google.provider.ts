import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import {
  BARBADOS_BOUNDS,
  GeocodeProvider,
  GeocodeResult,
  parishValue,
  ResolvedPlace,
  toGeocodeResult,
} from "../geocode-result";

/** A matched span of text; `startOffset` is omitted when it is 0. */
interface GoogleMatch {
  startOffset?: number;
  endOffset?: number;
}

/** The subset of a Places API (New) Autocomplete response we consume. */
interface GoogleAutocompleteResponse {
  suggestions?: {
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: {
        mainText?: { text?: string; matches?: GoogleMatch[] };
        secondaryText?: { text?: string };
      };
      types?: string[];
    };
  }[];
}

/** The subset of a Places API (New) Place Details response we ask for. */
interface GooglePlaceDetails {
  location?: { latitude?: number; longitude?: number };
  addressComponents?: { longText?: string; types?: string[] }[];
}

const PLACES_URL = "https://places.googleapis.com/v1/places";

/**
 * Google Places API (New) — metered. `search` is Autocomplete: predictions
 * matching what the applicant has typed so far, places by name included
 * ("kensin" → Kensington Oval), restricted to Barbados and its bounds.
 * Predictions carry no coordinate, so a picked one is looked up with `resolve`
 * (Place Details, location and address parts only). Passing the same session
 * token to both bills the run of keystrokes and the pick as one session.
 *
 * Any failed call — quota or budget reached, bad key, outage — rejects, and the
 * service falls back to the next provider.
 */
export class GoogleProvider implements GeocodeProvider {
  readonly name = "google";

  constructor(
    private readonly http: HttpService,
    private readonly apiKey: string,
  ) {}

  async search(query: string, sessionToken?: string): Promise<GeocodeResult[]> {
    const { south, west, north, east } = BARBADOS_BOUNDS;
    const response = await firstValueFrom(
      this.http.post<GoogleAutocompleteResponse>(
        `${PLACES_URL}:autocomplete`,
        {
          input: query,
          includedRegionCodes: ["bb"],
          locationRestriction: {
            rectangle: {
              low: { latitude: south, longitude: west },
              high: { latitude: north, longitude: east },
            },
          },
          ...(sessionToken ? { sessionToken } : {}),
        },
        { headers: { "X-Goog-Api-Key": this.apiKey } },
      ),
    );

    const results: GeocodeResult[] = [];
    for (const { placePrediction: p } of response.data?.suggestions ?? []) {
      const mainText = p?.structuredFormat?.mainText?.text;
      if (!p?.placeId || !mainText) continue;
      // The country itself: picking it would route the case by the island's
      // centroid, to an arbitrary polyclinic.
      if (p.types?.includes("country")) continue;

      const secondaryText = p.structuredFormat?.secondaryText?.text ?? "";
      // Reuse the address parser on the "where": it drops the country,
      // postcode and plus code and pulls out the parish; what is left (street,
      // town) is line 2. The place's name is line 1.
      const where = toGeocodeResult({
        label: secondaryText,
        lat: "",
        lon: "",
        parishHints: [],
      });
      results.push({
        label: p.text?.text ?? mainText,
        placeId: p.placeId,
        mainText,
        secondaryText,
        matches: (p.structuredFormat?.mainText?.matches ?? []).map((m) => ({
          start: m.startOffset ?? 0,
          end: m.endOffset ?? 0,
        })),
        line1: mainText,
        line2: [where.line1, where.line2].filter(Boolean).join(", "),
        parish: where.parish,
      });
    }
    return results;
  }

  async resolve(
    placeId: string,
    sessionToken?: string,
  ): Promise<ResolvedPlace> {
    const response = await firstValueFrom(
      this.http.get<GooglePlaceDetails>(
        `${PLACES_URL}/${encodeURIComponent(placeId)}`,
        {
          params: sessionToken ? { sessionToken } : {},
          headers: {
            "X-Goog-Api-Key": this.apiKey,
            "X-Goog-FieldMask": "location,addressComponents",
          },
        },
      ),
    );

    const { location, addressComponents } = response.data ?? {};
    if (
      typeof location?.latitude !== "number" ||
      typeof location?.longitude !== "number"
    ) {
      throw new Error(`place ${placeId} has no location`);
    }
    const parishName = (addressComponents ?? []).find((c) =>
      c.types?.includes("administrative_area_level_1"),
    )?.longText;

    return {
      lat: location.latitude.toFixed(6),
      lon: location.longitude.toFixed(6),
      parish: parishName ? parishValue(parishName) : "",
    };
  }
}
