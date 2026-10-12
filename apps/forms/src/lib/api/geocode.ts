// Same base-URL resolution as the forms file-upload client.
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/** One Barbados address suggestion from the `/geocode` proxy. */
export interface GeocodeResult {
  /** Full formatted address. */
  label: string;
  /**
   * The coordinate. Absent on a place suggestion (`placeId` set) — look it up
   * with {@link resolvePlace} once the applicant picks it.
   */
  lat?: string;
  lon?: string;
  /** Primary address line (name + street). */
  line1: string;
  /** Locality (town / district). */
  line2: string;
  /** Parish select value (e.g. `st-michael`), or "" when not resolved. */
  parish: string;
  /** Set on a Google place suggestion. */
  placeId?: string;
  /** The place's name, shown bold in the dropdown. */
  mainText?: string;
  /** Where it is, shown after the name. */
  secondaryText?: string;
  /** Spans of `mainText` that match what was typed. */
  matches?: { start: number; end: number }[];
}

/** The coordinate (and parish) of a picked place suggestion. */
export interface ResolvedPlace {
  lat: string;
  lon: string;
  parish: string;
}

/** Minimum characters before we query — avoids noisy one/two-letter lookups. */
export const MIN_QUERY_LENGTH = 3;

/**
 * Fetch Barbados-only address suggestions. Returns `[]` for a query shorter
 * than {@link MIN_QUERY_LENGTH}. Throws on a network/HTTP failure so the field
 * can show a "suggestions unavailable" note; an aborted request rejects with an
 * `AbortError`, which the caller ignores. `session` groups the applicant's
 * keystrokes and their pick into one billed lookup session.
 */
export async function searchAddresses(
  q: string,
  signal?: AbortSignal,
  session?: string,
): Promise<GeocodeResult[]> {
  const query = q.trim();
  if (query.length < MIN_QUERY_LENGTH) return [];

  const params = new URLSearchParams({ q: query });
  if (session) params.set("session", session);
  const res = await fetch(`${API_URL}/geocode?${params}`, { signal });
  if (!res.ok) throw new Error(`geocode request failed: ${res.status}`);
  return (await res.json()) as GeocodeResult[];
}

/** Look up the coordinate of a picked place suggestion. Throws on failure. */
export async function resolvePlace(
  placeId: string,
  session?: string,
): Promise<ResolvedPlace> {
  const params = session ? `?${new URLSearchParams({ session })}` : "";
  const res = await fetch(
    `${API_URL}/geocode/place/${encodeURIComponent(placeId)}${params}`,
  );
  if (!res.ok) throw new Error(`place lookup failed: ${res.status}`);
  return (await res.json()) as ResolvedPlace;
}

/**
 * The address at a point — for a pin the applicant placed on the map. Throws
 * when there is none (404) or the lookup fails.
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
): Promise<GeocodeResult> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  const res = await fetch(`${API_URL}/geocode/reverse?${params}`);
  if (!res.ok) throw new Error(`reverse lookup failed: ${res.status}`);
  return (await res.json()) as GeocodeResult;
}
