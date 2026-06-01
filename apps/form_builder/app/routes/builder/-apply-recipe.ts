import {
  deserializeRecipe,
  serializeRecipeDraft,
} from "@govtech-bb/form-builder";
import type { RecipeDraft, RegistryCatalog } from "@govtech-bb/form-builder";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";

/**
 * Turn a recipe into the args the editor's load path needs. The version comes
 * from the recipe itself. `deserialize` is injectable for testing.
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
): { draft: RecipeDraft; version: string } {
  return { draft: deserialize(recipe, catalog), version: recipe.version };
}

/**
 * Whether two drafts describe the same form, ignoring version and the
 * serialize-stamped `createdAt`/`updatedAt`. Drives the AI sidebar's no-op
 * guard: a conversational reply that returns an unchanged recipe must not bump
 * the patch version. Serializing strips the editor-only field ids (so freshly
 * deserialized drafts compare equal to the working draft), and a fixed version
 * neutralises the version field.
 */
export function draftsEqual(a: RecipeDraft, b: RecipeDraft): boolean {
  const normalize = (d: RecipeDraft): string => {
    const {
      createdAt: _c,
      updatedAt: _u,
      ...rest
    } = serializeRecipeDraft(d, {
      version: "0.0.0",
    });
    return JSON.stringify(rest);
  };
  return normalize(a) === normalize(b);
}
