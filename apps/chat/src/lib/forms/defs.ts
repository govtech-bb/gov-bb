import {
  serviceContractSchema,
  type ServiceContract,
} from "@govtech-bb/form-types";
import { getServerEnv } from "#/config/env";

// Fetch + validate a form's ServiceContract from the forms API. Used by the
// in-chat form tools (features.forms). A short-TTL cache (definitions change
// rarely; a chat turn shouldn't re-fetch), a negative cache so a missing/invalid
// form doesn't hammer the API, and graceful null on any failure so a forms turn
// degrades to "unavailable" rather than throwing. `fetchImpl` is injectable so
// the fetch + parse + cache logic is unit-testable without a live API (mirrors
// embed.ts's injectable `send`).

const DEF_TTL_MS = 5 * 60_000;
const MISS_TTL_MS = 30_000;

type Cached = { value: ServiceContract | null; expiresAt: number };
const cache = new Map<string, Cached>();

// The forms API wraps the contract: { data: ServiceContract }.
type DefResponse = { data: unknown };

export interface FormDefDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  signal?: AbortSignal;
}

export async function getFormDefinition(
  formId: string,
  deps: FormDefDeps = {},
): Promise<ServiceContract | null> {
  const now = deps.now ?? Date.now;
  const doFetch = deps.fetchImpl ?? fetch;

  const hit = cache.get(formId);
  if (hit && hit.expiresAt > now()) return hit.value;

  const base = getServerEnv().FORM_API_URL;
  if (!base) return null; // forms API not configured

  try {
    const res = await doFetch(
      `${base}/form-definitions/${encodeURIComponent(formId)}`,
      { signal: deps.signal },
    );
    if (!res.ok) throw new Error(`form-definitions/${formId} → ${res.status}`);
    const body = (await res.json()) as DefResponse;
    const parsed = serviceContractSchema.safeParse(body.data);
    const value = parsed.success ? parsed.data : null;
    const ttl = parsed.success ? DEF_TTL_MS : MISS_TTL_MS;
    cache.set(formId, { value, expiresAt: now() + ttl });
    return value;
  } catch {
    cache.set(formId, { value: null, expiresAt: now() + MISS_TTL_MS });
    return null;
  }
}

// Test seam — clears the module cache between cases.
export function clearFormDefCache(): void {
  cache.clear();
}
