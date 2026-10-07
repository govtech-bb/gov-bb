import {
  deserializeRecipe,
  serializeRecipeDraft,
} from "@govtech-bb/form-builder";
import type { RecipeDraft, RegistryCatalog } from "@govtech-bb/form-builder";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";

/**
 * Turn a recipe into the args the editor's load path needs. `deserialize` is
 * injectable for testing. Recipe versioning is retired (#1196), so no version
 * is returned.
 *
 * Used by the AI sidebar's apply pipeline: a recipe returned by the assistant
 * is deserialized into a draft before it can be validated and loaded.
 */
export function buildLoadArgs(
  recipe: ServiceContractRecipe,
  catalog: RegistryCatalog,
  deserialize: (
    r: ServiceContractRecipe,
    c: RegistryCatalog,
  ) => RecipeDraft = deserializeRecipe,
): { draft: RecipeDraft } {
  return { draft: deserialize(recipe, catalog) };
}

/**
 * Whether two drafts describe the same form, ignoring version and the
 * serialize-stamped `createdAt`/`updatedAt`. Drives the AI sidebar's no-op
 * guard: a conversational reply that returns an unchanged recipe must not bump
 * the patch version. Serializing strips the editor-only field ids (so freshly
 * deserialized drafts compare equal to the working draft), and a fixed version
 * neutralises the version field.
 */
export function draftsEqual(
  a: RecipeDraft,
  b: RecipeDraft,
  opts: { comparePayments?: boolean } = {},
): boolean {
  const normalize = (d: RecipeDraft): string => {
    const { createdAt: _c, updatedAt: _u, ...rest } = serializeRecipeDraft(d);
    return JSON.stringify(rest);
  };
  if (normalize(a) !== normalize(b)) return false;
  // `serializeRecipeDraft` strips payment processors — they persist to a
  // per-environment DB sibling, never the recipe (#716, ADR 0033) — so the
  // serialize-only compare above can't see edits to a payment processor.
  //
  // `comparePayments` is opt-in because the two callers want opposite things:
  //   • the unsaved-changes guard compares two in-memory drafts that both still
  //     hold payment config, and MUST flag a payment edit as a change (#958).
  //   • the AI no-op guard compares the working draft against a *deserialized
  //     recipe*, which never carries payment processors — folding payments in
  //     there would make an unchanged payment form always read as "changed".
  // So payments are only compared when the caller asks. Drop the editor-only
  // `id` (never persisted, ADR 0009) so re-adding an identical processor isn't
  // "a change".
  if (!opts.comparePayments) return true;
  const payments = (d: RecipeDraft): string =>
    JSON.stringify(
      (d.processors ?? [])
        .filter((p) => p.type === "payment")
        .map(({ id: _id, ...rest }) => rest),
    );
  return payments(a) === payments(b);
}
