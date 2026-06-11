import {
  serviceContractSchema,
  type ServiceContract,
} from "@govtech-bb/form-types";
import { getServerEnv } from "#/config/env";
import { isSurfaceableForm } from "./policy";
import { TITLE_STOP, tokenize } from "./tokenize";

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
  const env = getServerEnv();
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

// The cache holds the UNFILTERED published list; the policy filter is applied
// on read. getFormIndex/getFormSlugs serve only policy-approved forms (the
// approval gate for matching/collecting/handing off — see ./policy.ts), while
// getAllFormSlugs sees everything published, so the unapproved-form
// disclosure can distinguish "form exists but isn't chat-enabled" from "no
// form exists" instead of falsely claiming the form hasn't been built.
async function fetchIndex(signal?: AbortSignal): Promise<FormIndexEntry[]> {
  if (fresh(indexCache)) return indexCache.value;
  try {
    const body = await fetchJson<ListResponse>(`/form-definitions`, signal);
    const entries: FormIndexEntry[] = body.data
      .filter((d) => d.formId && d.title)
      .map((d) => ({
        formId: d.formId,
        title: d.title,
        titleToks: tokenize(d.title, TITLE_STOP),
      }));
    indexCache = { value: entries, expiresAt: Date.now() + INDEX_TTL_MS };
    return entries;
  } catch (err) {
    console.warn("[chat] form-definitions list fetch failed:", err);
    return indexCache?.value ?? [];
  }
}

export async function getFormIndex(
  signal?: AbortSignal,
): Promise<FormIndexEntry[]> {
  return (await fetchIndex(signal)).filter((e) => isSurfaceableForm(e.formId));
}

export async function getFormSlugs(signal?: AbortSignal): Promise<string[]> {
  return (await getFormIndex(signal)).map((e) => e.formId);
}

// EVERY published form id, approved or not — only for existence checks.
export async function getAllFormSlugs(signal?: AbortSignal): Promise<string[]> {
  return (await fetchIndex(signal)).map((e) => e.formId);
}
