import {
  serviceContractSchema,
  type ServiceContract,
} from "@govtech-bb/form-types";
import { env } from "#/lib/env";

const DEF_TTL_MS = 5 * 60_000;
const MISS_TTL_MS = 30_000;
const INDEX_TTL_MS = 5 * 60_000;

type Cached<T> = { value: T; expiresAt: number };

const defCache = new Map<string, Cached<ServiceContract | null>>();
let indexCache: Cached<FormIndexEntry[]> | null = null;

function fresh<T>(c: Cached<T> | null | undefined): c is Cached<T> {
  return !!c && c.expiresAt > Date.now();
}

async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  if (!env.FORM_API_URL) throw new Error("FORM_API_URL not set");
  const res = await fetch(`${env.FORM_API_URL}${path}`, { signal });
  if (!res.ok) {
    throw new Error(`Form API ${path} → ${res.status}`);
  }
  return (await res.json()) as T;
}

// Per the forms API contract: { data: ServiceContract }
type DefResponse = { data: unknown };
export type FormIndexEntry = {
  formId: string;
  title: string;
  // Pre-tokenized title — cached once per fetch so the per-turn intent
  // matcher doesn't re-tokenize every form on every chat turn.
  titleToks: Set<string>;
};
type ListResponse = {
  data: Array<{ formId: string; title: string } & Record<string, unknown>>;
};

const TITLE_STOP = new Set([
  "the",
  "a",
  "an",
  "of",
  "for",
  "to",
  "in",
  "on",
  "and",
  "or",
  "form",
  "application",
  "apply",
  "register",
  "registration",
  "online",
  "service",
]);

function titleTokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter((t) => t.length > 2 && !TITLE_STOP.has(t)),
  );
}

export async function getFormDefinition(
  slug: string,
  signal?: AbortSignal,
): Promise<ServiceContract | null> {
  const hit = defCache.get(slug);
  if (fresh(hit)) return hit.value;

  try {
    const body = await fetchJson<DefResponse>(
      `/form-definitions/${encodeURIComponent(slug)}`,
      signal,
    );
    const parsed = serviceContractSchema.safeParse(body.data);
    if (!parsed.success) {
      console.warn(
        `[chat] form-definition ${slug} failed schema parse:`,
        parsed.error.issues.slice(0, 3),
      );
      defCache.set(slug, { value: null, expiresAt: Date.now() + MISS_TTL_MS });
      return null;
    }
    defCache.set(slug, {
      value: parsed.data,
      expiresAt: Date.now() + DEF_TTL_MS,
    });
    return parsed.data;
  } catch (err) {
    console.warn(`[chat] form-definition ${slug} fetch failed:`, err);
    defCache.set(slug, { value: null, expiresAt: Date.now() + MISS_TTL_MS });
    return null;
  }
}

export async function getFormIndex(
  signal?: AbortSignal,
): Promise<FormIndexEntry[]> {
  if (fresh(indexCache)) return indexCache.value;
  try {
    const body = await fetchJson<ListResponse>(`/form-definitions`, signal);
    const entries: FormIndexEntry[] = body.data
      .filter((d) => d.formId && d.title)
      .map((d) => ({
        formId: d.formId,
        title: d.title,
        titleToks: titleTokens(d.title),
      }));
    indexCache = { value: entries, expiresAt: Date.now() + INDEX_TTL_MS };
    return entries;
  } catch (err) {
    console.warn("[chat] form-definitions list fetch failed:", err);
    return indexCache?.value ?? [];
  }
}

export async function getFormSlugs(signal?: AbortSignal): Promise<string[]> {
  return (await getFormIndex(signal)).map((e) => e.formId);
}
