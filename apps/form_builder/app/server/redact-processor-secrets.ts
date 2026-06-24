import type { Processor } from "@govtech-bb/form-types";

/**
 * Processor-secret redaction for the builder UI (#294).
 *
 * `getRecipe` returns a recipe to the browser, where it is reachable via
 * DevTools / extensions / XSS. Processor secrets must not travel there. The UI
 * never renders these fields — it only carries them forward on save — so we
 * redact them on read and restore the real values on save, server-side.
 *
 * Secret-bearing fields that can appear in `recipe.processors[]`:
 *   - webhook  `config.secret`       (legacy inline HMAC key)
 *   - webhook  `config.auth.secret`  (hmac scheme)
 *   - opencrvs `config.token`
 * Payment processors live only in the DB `form_config` sidecar (ADR 0033), so
 * they never reach this path.
 */
export const REDACTED_SECRET = "__REDACTED__";

interface SecretRef {
  /** Stable key identifying which field this is, so a redacted value is
   *  restored from the matching stored field (not by positional luck). */
  key: string;
  get: () => unknown;
  set: (value: unknown) => void;
}

// The secret accessors present on a single processor. Typed loosely on purpose:
// the recipe arrives as `unknown` on the save path.
function secretRefs(processor: unknown): SecretRef[] {
  const p = processor as { type?: string; config?: Record<string, unknown> };
  const refs: SecretRef[] = [];
  if (!p || !p.config) return refs;

  if (p.type === "webhook") {
    const config = p.config;
    refs.push({
      key: "config.secret",
      get: () => config.secret,
      set: (v) => {
        config.secret = v;
      },
    });
    const auth = config.auth as
      | { scheme?: string; secret?: unknown }
      | undefined;
    if (auth && auth.scheme === "hmac") {
      refs.push({
        key: "config.auth.secret",
        get: () => auth.secret,
        set: (v) => {
          auth.secret = v;
        },
      });
    }
  }

  if (p.type === "opencrvs") {
    const config = p.config;
    refs.push({
      key: "config.token",
      get: () => config.token,
      set: (v) => {
        config.token = v;
      },
    });
  }

  return refs;
}

function processorsOf(recipe: unknown): unknown[] {
  const p = (recipe as { processors?: unknown })?.processors;
  return Array.isArray(p) ? p : [];
}

/** Replace each present processor secret with the redaction placeholder.
 *  Returns a clone; the input is not mutated. */
export function redactRecipeSecrets<T>(recipe: T): T {
  const clone = structuredClone(recipe);
  for (const processor of processorsOf(clone)) {
    for (const ref of secretRefs(processor)) {
      const value = ref.get();
      if (typeof value === "string" && value.length > 0) {
        ref.set(REDACTED_SECRET);
      }
    }
  }
  return clone;
}

/** True if any processor secret in `recipe` is the redaction placeholder —
 *  i.e. the browser sent back a recipe that still needs its secrets restored. */
export function hasRedactedSecret(recipe: unknown): boolean {
  for (const processor of processorsOf(recipe)) {
    for (const ref of secretRefs(processor)) {
      if (ref.get() === REDACTED_SECRET) return true;
    }
  }
  return false;
}

/**
 * Restore real secrets onto `incoming` from `stored`, wherever `incoming`
 * carries the placeholder. Processors are matched by `type` + position within
 * that type (forms carry a single webhook in practice). Returns a clone.
 *
 * Does not guarantee every placeholder is resolved — call
 * `assertNoRedactedSecrets` afterwards to fail closed if one wasn't.
 */
export function restoreRecipeSecrets<T>(incoming: T, stored: unknown): T {
  const clone = structuredClone(incoming);

  const storedByType = new Map<string, unknown[]>();
  for (const sp of processorsOf(stored)) {
    const type = (sp as { type?: string }).type ?? "";
    const list = storedByType.get(type) ?? [];
    list.push(sp);
    storedByType.set(type, list);
  }

  const cursor = new Map<string, number>();
  for (const processor of processorsOf(clone)) {
    const refs = secretRefs(processor);
    if (refs.length === 0) continue;

    const type = (processor as { type?: string }).type ?? "";
    const index = cursor.get(type) ?? 0;
    cursor.set(type, index + 1);

    const storedProcessor = storedByType.get(type)?.[index];
    const storedRefs = new Map(
      secretRefs(storedProcessor).map((r) => [r.key, r]),
    );

    for (const ref of refs) {
      if (ref.get() !== REDACTED_SECRET) continue;
      const real = storedRefs.get(ref.key)?.get();
      // Only overwrite when the stored recipe actually has the secret. If it
      // doesn't, leave the placeholder in place so assertNoRedactedSecrets
      // fails closed rather than silently dropping the secret.
      if (typeof real === "string" && real.length > 0) ref.set(real);
    }
  }

  return clone;
}

/** Fail closed: throw if any redaction placeholder survived a restore, so a
 *  placeholder can never be persisted in place of a real secret. */
export function assertNoRedactedSecrets(recipe: unknown): void {
  if (hasRedactedSecret(recipe)) {
    throw new Error(
      "Refusing to save: a processor secret could not be restored from the stored recipe",
    );
  }
}

export type { Processor };
