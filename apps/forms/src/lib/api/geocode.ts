// Same base-URL resolution as the forms file-upload client.
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/** One Barbados address suggestion from the `/geocode` proxy. */
export interface GeocodeResult {
  /** Full formatted address — shown in the suggestions dropdown. */
  label: string;
  lat: string;
  lon: string;
  /** Primary address line (name + street). */
  line1: string;
  /** Locality (town / district). */
  line2: string;
  /** Parish select value (e.g. `st-michael`), or "" when not resolved. */
  parish: string;
}

/** Minimum characters before we query — avoids noisy one/two-letter lookups. */
export const MIN_QUERY_LENGTH = 3;

/**
 * Fetch Barbados-only address suggestions. Returns `[]` for a query shorter
 * than {@link MIN_QUERY_LENGTH}. Throws on a network/HTTP failure so the field
 * can show a "suggestions unavailable" note; an aborted request rejects with an
 * `AbortError`, which the caller ignores.
 */
export async function searchAddresses(
  q: string,
  signal?: AbortSignal,
): Promise<GeocodeResult[]> {
  const query = q.trim();
  if (query.length < MIN_QUERY_LENGTH) return [];

  const res = await fetch(`${API_URL}/geocode?q=${encodeURIComponent(query)}`, {
    signal,
  });
  if (!res.ok) throw new Error(`geocode request failed: ${res.status}`);
  return (await res.json()) as GeocodeResult[];
}
