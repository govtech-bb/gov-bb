/**
 * form-query.ts
 *
 * TanStack Query option factories for the two-tier form caching strategy.
 *
 * Tier 1 — ServiceContract cache  (key: service-contract:<formId>)
 *   Fetches and maps the raw API contract to a ClientServiceContract.
 *   Stale after 60 seconds — version bumps are detected on next navigation.
 *
 * Tier 2 — FormMeta cache  (key: form-schema:<formId>:<version>:<preview|null>)
 *   Stores the fully-built FormMeta (Zod validation schema, step list,
 *   default values, idempotency key, etc.).  The version AND preview token
 *   are both part of the cache key so a version bump produces a new entry
 *   automatically, and a preview-built FormMeta can never be served to an
 *   untokened request at the same version.  staleTime: Infinity because a
 *   given (formId, version, preview) combination is deterministic.
 *
 * Usage in a TanStack Router loader:
 *
 *   const clientContract = await queryClient.ensureQueryData(
 *     contractQueryOptions(formId, deps.preview),
 *   );
 *   return queryClient.ensureQueryData(
 *     formMetaQueryOptions(formId, clientContract, deps.preview),
 *   );
 */

import { queryOptions } from "@tanstack/react-query";
import type { ClientServiceContract, FormMeta } from "@forms/types";
import { fetchContract } from "./form-fetcher";

// ---------------------------------------------------------------------------
// Cache key constants
// ---------------------------------------------------------------------------

/**
 * Prefix for raw ServiceContract cache entries.
 * Full key shape: ["service-contract", formId]
 */
export const CONTRACT_CACHE_KEY = "service-contract" as const;

/**
 * Normalize an operator recipe token (preview or draft): an empty or
 * whitespace-only value becomes `undefined`. Shared by both cache tiers so the
 * contract key, the FormMeta key, and the X-Recipe-Preview / X-Recipe-Draft
 * header guards can never disagree about whether a request is tokened.
 */
export const normalizePreviewToken = (preview?: string): string | undefined =>
  preview?.trim() ? preview.trim() : undefined;

/**
 * Prefix for built FormMeta cache entries.
 * Full key shape: ["form-schema", formId, preview | null, draft | null]
 *
 * #1196: recipe versioning is retired — a form resolves to one canonical
 * recipe, so the key no longer carries a version.
 */
export const FORM_SCHEMA_CACHE_KEY = "form-schema" as const;

/**
 * Returns the canonical cache key tuple for a built FormMeta.
 * Useful when manually invalidating or reading from the query cache.
 *
 * The preview and draft tokens are separate key segments (#1682) so a
 * draft-sourced FormMeta (DB scratch) can never collide with — or be served as
 * — a public or preview (published) FormMeta for the same formId.
 *
 * @example
 *   queryClient.invalidateQueries({ queryKey: formSchemaCacheKey("my-form") });
 *   queryClient.invalidateQueries({ queryKey: formSchemaCacheKey("my-form", "tok") });
 */
export const formSchemaCacheKey = (
  formId: string,
  preview?: string,
  draft?: string,
): readonly [string, string, string | null, string | null] =>
  [
    FORM_SCHEMA_CACHE_KEY,
    formId,
    normalizePreviewToken(preview) ?? null,
    normalizePreviewToken(draft) ?? null,
  ] as const;

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
export const contractQueryOptions = (
  formId: string,
  preview?: string,
  draft?: string,
) => {
  // Treat an empty/blank ?preview=/?draft= the same as absent, so the cache key
  // and the header guards can never disagree. Preview and draft are distinct
  // key segments so their responses can never collide (#1682).
  const previewToken = normalizePreviewToken(preview);
  const draftToken = normalizePreviewToken(draft);
  return queryOptions<ClientServiceContract>({
    queryKey: [
      CONTRACT_CACHE_KEY,
      formId,
      previewToken ?? null,
      draftToken ?? null,
    ] as const,
    queryFn: () => fetchContract(formId, previewToken, draftToken),
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
 * #1196: recipe versioning is retired, so the cache key is `(formId, preview)`
 * with no version. Version used to be the cache-busting signal — a publish bumped
 * it, producing a new key. Without it, the FormMeta must instead expire so a
 * republished recipe is picked up:
 *
 *   recipe cached → admin republishes → contractQueryOptions goes stale after
 *   60 s → re-fetches the new contract → this query's staleTime elapses →
 *   buildForm() re-runs against the new contract under the same (formId, preview)
 *   key.
 *
 * staleTime matches the contract tier (60 s) so the built FormMeta can never be
 * served fresher than the contract it was built from. (It is still deterministic
 * for a given contract; the bound just lets a republish propagate.)
 *
 * gcTime: 30 minutes — keeps recently-visited forms readily available without
 * holding memory indefinitely.
 *
 * @param formId          The form identifier.
 * @param clientContract  The already-fetched and locale-mapped contract that
 *                        buildForm() runs against.
 * @param preview         Optional operator preview token. When present it is
 *                        included in the cache key so a preview-built FormMeta
 *                        can never be served to an untokened request.
 *                        Normalization follows the same rules as
 *                        `normalizePreviewToken` (blank → treated as no preview).
 */
export const formMetaQueryOptions = (
  formId: string,
  clientContract: ClientServiceContract,
  preview?: string,
  draft?: string,
) =>
  queryOptions<FormMeta>({
    queryKey: formSchemaCacheKey(formId, preview, draft),
    queryFn: () =>
      import("@govtech-bb/form-renderer").then((m) =>
        m.buildForm(clientContract),
      ),
    staleTime: 60_000,
    gcTime: 30 * 60_000,
  });
