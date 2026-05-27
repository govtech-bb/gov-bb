/**
 * form-query.ts
 *
 * TanStack Query option factories for the two-tier form caching strategy.
 *
 * Tier 1 — ServiceContract cache  (key: service-contract:<formId>)
 *   Fetches and maps the raw API contract to a ClientServiceContract.
 *   Stale after 60 seconds — version bumps are detected on next navigation.
 *
 * Tier 2 — FormMeta cache  (key: form-schema:<formId>:<version>)
 *   Stores the fully-built FormMeta (Zod validation schema, step list,
 *   default values, idempotency key, etc.).  The version is part of the
 *   cache key so a version bump produces a new entry automatically without
 *   any manual invalidation.  staleTime: Infinity because a given
 *   (formId, version) pair is deterministic and never changes.
 *
 * Usage in a TanStack Router loader:
 *
 *   const clientContract = await queryClient.ensureQueryData(
 *     contractQueryOptions(formId, deps.preview),
 *   );
 *   return queryClient.ensureQueryData(
 *     formMetaQueryOptions(formId, clientContract),
 *   );
 */

import { queryOptions } from "@tanstack/react-query";
import type { ClientServiceContract, FormMeta } from "@forms/types";
import { fetchContract } from "./form-fetcher";
import { buildForm } from "./build-form";

// ---------------------------------------------------------------------------
// Cache key constants
// ---------------------------------------------------------------------------

/**
 * Prefix for raw ServiceContract cache entries.
 * Full key shape: ["service-contract", formId]
 */
export const CONTRACT_CACHE_KEY = "service-contract" as const;

/**
 * Prefix for built FormMeta cache entries.
 * Full key shape: ["form-schema", formId, version]
 *
 * Matches the task-specified format  `form-schema:${schemaId}:${version}`.
 */
export const FORM_SCHEMA_CACHE_KEY = "form-schema" as const;

/**
 * Returns the canonical cache key tuple for a built FormMeta.
 * Useful when manually invalidating or reading from the query cache.
 *
 * @example
 *   queryClient.invalidateQueries({ queryKey: formSchemaCacheKey("my-form", "1.2.0") });
 */
export const formSchemaCacheKey = (
  formId: string,
  version: string,
): readonly [string, string, string] =>
  [FORM_SCHEMA_CACHE_KEY, formId, version] as const;

// ---------------------------------------------------------------------------
// Tier 1 — ServiceContract query options
// ---------------------------------------------------------------------------

/**
 * TanStack Query options for fetching and caching a ClientServiceContract.
 *
 * - Stale after 60 s so version changes are picked up on the next page visit.
 * - GC'd from memory 10 minutes after the last subscriber dismounts.
 * - For the synthetic "example" / "master" IDs, fetchContract loads a local
 *   JSON fixture and skips the network call entirely.
 *
 * @param formId   The form identifier (path param from the URL).
 * @param preview  Optional operator preview token sourced from the `?preview=`
 *                 URL search param. When present, the token is forwarded to the
 *                 API as the `X-Recipe-Preview` header so the server returns the
 *                 unpublished DB draft instead of the published file recipe.
 *                 Including preview in the cache key ensures a preview response
 *                 can never collide with — or be served as — a normal (published)
 *                 response for the same formId.
 *                 An empty or whitespace-only value is treated as no preview so
 *                 the cache key and the header guard can never disagree.
 */
export const contractQueryOptions = (formId: string, preview?: string) => {
  // Treat an empty/blank ?preview= the same as no preview, so the cache key
  // and the X-Recipe-Preview header guard can never disagree.
  const token = preview?.trim() ? preview.trim() : undefined;
  return queryOptions<ClientServiceContract>({
    queryKey: [CONTRACT_CACHE_KEY, formId, token ?? null] as const,
    queryFn: () => fetchContract(formId, token),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
};

// ---------------------------------------------------------------------------
// Tier 2 — FormMeta query options
// ---------------------------------------------------------------------------

/**
 * TanStack Query options for building and caching a FormMeta.
 *
 * The cache key includes the contract version so that a version bump produces
 * a completely new cache entry — the old entry is kept until it is GC'd.
 * This means:
 *
 *   version 1.0.0 cached → admin publishes 1.1.0 → contractQueryOptions
 *   becomes stale → re-fetches → new version → new formMetaQueryOptions key
 *   → cache miss → buildForm() runs → new FormMeta cached under 1.1.0 key.
 *
 * staleTime: Infinity — a given (formId, version) combination is deterministic.
 * The same contract always produces the same FormMeta; there is no reason to
 * rebuild it unless the version changes.
 *
 * gcTime: 30 minutes — keeps recently-visited forms readily available without
 * holding memory indefinitely.
 *
 * @param formId          The form identifier.
 * @param clientContract  The already-fetched and locale-mapped contract.
 *                        Its `.version` field becomes part of the cache key.
 */
export const formMetaQueryOptions = (
  formId: string,
  clientContract: ClientServiceContract,
) =>
  queryOptions<FormMeta>({
    queryKey: formSchemaCacheKey(formId, clientContract.version),
    queryFn: () => buildForm(clientContract),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });
