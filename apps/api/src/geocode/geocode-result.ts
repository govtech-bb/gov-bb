/** A single address suggestion returned to the client. */
export interface GeocodeResult {
  /** The full formatted address — shown in the suggestions dropdown. */
  label: string;
  lat: string;
  lon: string;
  /** Primary address line (name + street), for address line 1. */
  line1: string;
  /** Locality (town / district), for address line 2. */
  line2: string;
  /** Parish select value (e.g. `st-michael`), or "" when not resolved. */
  parish: string;
}

/**
 * One geocoding backend. `search` resolves to the matches it found — `[]` is a
 * real "nothing matched" answer — and REJECTS when it could not answer at all
 * (outage, quota or budget reached, bad key), so the service moves on to the
 * next provider instead of reporting a false "no such address".
 */
export interface GeocodeProvider {
  readonly name: string;
  search(query: string): Promise<GeocodeResult[]>;
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

const parishValue = (raw: string): string =>
  PARISH_VALUE_BY_NORMALIZED[normalizeParish(raw)] ?? "";

const isPostcode = (part: string): boolean => /^bb\s?\d/i.test(part.trim());

/**
 * Split a formatted address into line 1 / line 2 / parish. Barbados has no
 * reliable structured street data, so this is deterministic string parsing:
 * drop the country and postcode, pull out the part matching a known parish,
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
    .filter(Boolean)
    .filter((p) => p.toLowerCase() !== "barbados" && !isPostcode(p));

  const remaining: string[] = [];
  for (const part of parts) {
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
