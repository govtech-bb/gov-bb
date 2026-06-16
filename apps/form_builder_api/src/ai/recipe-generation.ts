import { collectUnknownRefs, type UnknownRef } from "@govtech-bb/form-builder";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";
import { getFullCatalog } from "../catalog.js";
import { chat } from "./client.js";
import { extractRecipe } from "./recipe-extractor.js";

// The single turn sent to Bedrock. Mirrors the (unexported) ChatMessage shape
// in client.ts; every AI action is one self-contained user turn.
interface RecipeTurn {
  role: "user" | "assistant";
  content: string;
}

// What every AI recipe generation returns. `recipe` is null when the model
// replied conversationally without emitting a recipe; `unresolvableRefs` lists
// any refs in the emitted recipe that don't resolve against the full catalog.
export interface RecipeResponse {
  recipe: Record<string, unknown> | null;
  reply: string;
  unresolvableRefs: UnknownRef[];
}

// Shared tail for every AI recipe generation (Edit Form and PDF upload): run
// the Bedrock chat, extract the recipe from the reply, then best-effort flag
// refs that don't resolve against the full catalog (builtins + registry + live
// custom components).
//
// The ref pre-check runs on *unvalidated* model output after an expensive
// chat(), so it must never sink the response: a catalog/DB hiccup or a
// malformed step (missing elements/ref) degrades to "no warnings". The bad
// recipe is still caught downstream — the editor's strict /validate runs when
// refs are empty, and Deploy stays the hard gate (#504).
export async function generateRecipeResponse(
  systemPrompt: string,
  messages: RecipeTurn[],
  documentText?: string,
): Promise<RecipeResponse> {
  const reply = await chat(systemPrompt, messages, documentText);
  const recipe = extractRecipe(reply);

  let unresolvableRefs: UnknownRef[] = [];
  if (recipe && Array.isArray((recipe as { steps?: unknown }).steps)) {
    try {
      const catalog = await getFullCatalog();
      unresolvableRefs = collectUnknownRefs(
        recipe as unknown as ServiceContractRecipe,
        catalog,
      );
    } catch (err) {
      console.warn("recipe-generation: ref pre-check skipped —", err);
    }
  }

  return { recipe, reply, unresolvableRefs };
}
