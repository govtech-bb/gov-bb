import {
  paymentConfigAuthorSchema,
  type Processor,
} from "@govtech-bb/form-types";
import type { RecipeProcessorDraft } from "./types";

/**
 * Payment processors are now per-environment DB config (#716, ADR 0033): they
 * live in `form_config.config.processors`, never in the committed recipe. The
 * builder still edits them in the single processor editor alongside the
 * recipe-resident processors, so these helpers reconcile the two sources on
 * open and split them back apart on save.
 */

/**
 * Build the editor's processor list from the two sources on form open:
 *
 *  - `recipeProcessors` — the processors deserialized from the recipe (each
 *    already carrying an editor-only id). Post-#716 a recipe shouldn't carry a
 *    payment processor, but older recipes still might.
 *  - `dbProcessors` — the payment (and any other) processors fetched from
 *    `form_config.config` (no editor id yet).
 *
 * Rules:
 *  - Non-payment processors always come from the recipe (they're recipe-owned).
 *  - Payment processors come from the DB when present.
 *  - **Migration-on-resave (#750):** when the recipe still carries a payment
 *    processor AND the DB has none, lift the recipe's payment processor(s) into
 *    the editor (minting ids) so the next save persists them to the DB sibling
 *    and the serializer strips them from the recipe. This is the one-time
 *    migration path — once saved, the DB owns them and the recipe is clean.
 *
 * DB processors are given fresh editor ids (mirroring deserializeRecipe), so the
 * caller can treat the returned list uniformly.
 */
export function mergeDbProcessors(
  recipeProcessors: RecipeProcessorDraft[] | undefined,
  dbProcessors: Processor[] | null | undefined,
  mintId: () => string = () => crypto.randomUUID(),
): RecipeProcessorDraft[] | undefined {
  const recipe = recipeProcessors ?? [];
  const recipeNonPayment = recipe.filter((p) => p.type !== "payment");
  const recipePayment = recipe.filter((p) => p.type === "payment");
  const db = dbProcessors ?? [];
  // The DB blob holds payment config only (the builder write gate enforces this
  // — see forms.ts), but defend against a stray non-payment entry: filter to
  // payment so a non-payment blob row can never re-enter the editor as a
  // payment-slice member and duplicate a recipe-owned processor.
  const dbPayment = db.filter((p) => p.type === "payment");
  const dbPaymentWithIds: RecipeProcessorDraft[] = dbPayment.map((p) => ({
    ...p,
    id: mintId(),
  }));

  // DB is the source of truth for payment when it has any. Otherwise, lift the
  // recipe's payment processors (the #750 migration) — they already carry ids.
  // The lift condition is decided on the FILTERED set: a DB blob with only
  // non-payment entries still leaves payment to the recipe.
  const payment = dbPayment.length > 0 ? dbPaymentWithIds : recipePayment;
  const merged = [...recipeNonPayment, ...payment];

  // Preserve the absent-vs-empty distinction the serializer relies on: only
  // return undefined when there was genuinely nothing on either side.
  if (
    merged.length === 0 &&
    recipeProcessors === undefined &&
    (dbProcessors === null || dbProcessors === undefined)
  ) {
    return undefined;
  }
  return merged;
}

/**
 * Split an editor processor list into the two save destinations:
 *  - `recipeProcessors` is what stays in the draft for the recipe — the
 *    serializer strips payment anyway, but returning the full list keeps the
 *    draft intact for re-editing.
 *  - `dbProcessors` is the payment processors to send in the `processors`
 *    sibling field (editor-only ids stripped — they're never persisted).
 *
 * `dbProcessors` is `null` when there are no payment processors, so the caller
 * can pass it straight through as the sibling field's "clear" value.
 */
export function extractDbProcessors(
  processors: RecipeProcessorDraft[] | undefined,
): Processor[] | null {
  const payment = (processors ?? []).filter((p) => p.type === "payment");
  if (payment.length === 0) return null;
  return payment.map(({ id: _id, ...rest }) => rest as Processor);
}

/**
 * Validate the editor's payment processors against the author-time payment
 * schema before a save sends them as the DB sibling.
 *
 * `makeDefaultProcessor("payment")` seeds a payment processor with empty-string
 * fields (`department: ""`, etc.), but the builder API 400s on those — so an
 * author who adds a payment processor and saves before completing every field
 * gets the WHOLE save rejected with an opaque error. This pure check lets the UI
 * pre-flight the same constraint and surface a friendly, targeted message
 * instead of round-tripping to a generic 400.
 *
 * Returns the index (within the supplied draft list) of the first payment
 * processor whose config fails `paymentConfigAuthorSchema`, or `null` when every
 * payment processor is complete (or there are none). The index lets the caller
 * point the author at the specific incomplete processor.
 */
export function firstIncompletePaymentProcessor(
  processors: RecipeProcessorDraft[] | undefined,
): number | null {
  const list = processors ?? [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.type !== "payment") continue;
    if (!paymentConfigAuthorSchema.safeParse(p.config).success) {
      return i;
    }
  }
  return null;
}
