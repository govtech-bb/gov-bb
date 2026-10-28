/** A single address suggestion returned to the client. */
export interface GeocodeResult {
  /** The full formatted address — shown in the suggestions dropdown. */
  label: string;
  /**
   * The coordinate. Absent on a place suggestion (`placeId` set), which only
   * gets one when the applicant picks it — see {@link GeocodeProvider.resolve}.
   */
  lat?: string;
  lon?: string;
  /** Primary address line (name + street), for address line 1. */
  line1: string;
  /** Locality (town / district), for address line 2. */
  line2: string;
  /** Parish select value (e.g. `st-michael`), or "" when not resolved. */
  parish: string;
  /** Set on a place suggestion: resolve it for the coordinate once picked. */
  placeId?: string;
  /** The place's name, shown bold in the dropdown ("Kensington Oval"). */
  mainText?: string;
  /** Where it is, shown after the name ("President Kennedy Drive, …"). */
  secondaryText?: string;
  /** The spans of `mainText` that match what was typed, to embolden. */
  matches?: { start: number; end: number }[];
}

/** The coordinate (and parish) of a picked place suggestion. */
export interface ResolvedPlace {
  lat: string;
  lon: string;
  parish: string;
}

/**
 * One geocoding backend. `search` resolves to the matches it found — `[]` is a
 * real "nothing matched" answer — and REJECTS when it could not answer at all
 * (outage, quota or budget reached, bad key), so the service moves on to the
 * next provider instead of reporting a false "no such address".
 *
 * A provider whose suggestions carry no coordinate (Google Places) also
 * implements `resolve`, which looks the picked place up. `sessionToken` groups
 * a run of searches and the final lookup into one billed session.
 */
export interface GeocodeProvider {
  readonly name: string;
  /**
   * Whether the provider's terms let us cache its search answers. Google's do
   * not (Maps Platform terms §3.2.3(b): no caching beyond place IDs).
   */
  readonly cacheable?: boolean;
  search(query: string, sessionToken?: string): Promise<GeocodeResult[]>;
  resolve?(placeId: string, sessionToken?: string): Promise<ResolvedPlace>;
  /**
   * The address at a point — for a pin the applicant placed on the map. `null`
   * when there is none (a real answer); rejects when the provider could not
   * answer, like `search`.
   */
  reverse?(lat: number, lon: number): Promise<GeocodeResult | null>;
}

/**
 * The geographic bounds of Barbados, with a small margin round the coast. A
 * result outside them is a foreign address the catchment router would mis-route,
 * so it is never returned.
 */
export const BARBADOS_BOUNDS = {
  south: 13.03,
  west: -59.66,
  north: 13.34,
  east: -59.41,
} as const;

export const isWithinBarbados = (lat: number, lon: number): boolean =>
  lat >= BARBADOS_BOUNDS.south &&
  lat <= BARBADOS_BOUNDS.north &&
  lon >= BARBADOS_BOUNDS.west &&
  lon <= BARBADOS_BOUNDS.east;

// Barbados's 11 parishes → the `components/parish` select values. Keyed by a
// normalized name ("saint x" / "st. x" → "st x") so a provider's spelling
// ("Saint Michael") maps regardless of form.
const PARISH_VALUE_BY_NORMALIZED: Record<string, string> = {
  "christ church": "christ-church",
  "st andrew": "st-andrew",
  "st george": "st-george",
  "st james": "st-james",
  "st john": "st-john",
  "st joseph": "st-joseph",
  "st lucy": "st-lucy",
  "st michael": "st-michael",
  "st peter": "st-peter",
  "st philip": "st-philip",
  "st thomas": "st-thomas",
};

const normalizeParish = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/\bsaint\b/g, "st")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();

/** A provider's parish name ("Saint Michael") → its select value, or "". */
export const parishValue = (raw: string): string =>
  PARISH_VALUE_BY_NORMALIZED[normalizeParish(raw)] ?? "";

const POSTCODE = /\bbb\s?\d+\b/gi;
// An Open Location Code ("493G+XXX") — Google's stand-in for a missing street
// number. It means nothing to an applicant or an officer reading the address.
const PLUS_CODE = /^[23456789cfghjmpqrvwx]{2,8}\+[23456789cfghjmpqrvwx]*$/i;

/**
 * Split a formatted address into line 1 / line 2 / parish. Barbados has no
 * reliable structured street data, so this is deterministic string parsing:
 * drop the country, postcode and plus code, pull out the part matching a known parish,
 * treat the last remaining part as the locality (line 2) and the rest as line 1.
 * `parishHints` (the provider's structured address parts) are matched first.
 */
export function toGeocodeResult(input: {
  label: string;
  lat: string;
  lon: string;
  parishHints: readonly (string | undefined)[];
}): GeocodeResult {
  const { label, lat, lon } = input;

  let parish =
    input.parishHints.map((v) => (v ? parishValue(v) : "")).find(Boolean) ?? "";

  const parts = label
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  // The country closes the address. Google glues it to the parish and postcode
  // with no comma ("Saint Michael BB120004Barbados"), so strip it from the last
  // part rather than only dropping a bare "Barbados" part.
  if (parts.length > 0) {
    parts[parts.length - 1] = parts[parts.length - 1].replace(
      /\s*barbados$/i,
      "",
    );
  }
  const cleaned = parts
    .map((p) => p.replace(POSTCODE, "").trim())
    .filter((p) => p && !PLUS_CODE.test(p));

  const remaining: string[] = [];
  for (const part of cleaned) {
    const value = parishValue(part);
    if (value) {
      parish ||= value;
      continue;
    }
    remaining.push(part);
  }

  const line2 = remaining.length > 1 ? (remaining.pop() as string) : "";
  const line1 = remaining.join(", ");

  return { label, lat, lon, line1, line2, parish };
}
