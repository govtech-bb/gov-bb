import type { z } from "zod";
import { serviceContractRecipeSchema } from "./service-contract.type";

/**
 * Canonical serialization for recipe files (#2487).
 *
 * A recipe is written by three parties — the form builder's Deploy, a hand or
 * AI edit, and anything that round-trips it through Zod — and each emitted its
 * own key order. Since a recipe is "edited in place and reviewed by diff"
 * (ADR 0041's supersede note), every crossing rewrote the whole file: 47% of
 * the lines changed across the last 60 Deploy commits were pure reordering,
 * with individual commits reaching 99% noise. Diff review is the only gate on
 * citizen-facing form changes, so that noise is a correctness risk, not just an
 * annoyance.
 *
 * The fix is one canonical order, recovered from the schema itself rather than
 * a hand-maintained table, so a new schema field needs no edit here.
 *
 * NOT `serviceContractRecipeSchema.parse(recipe)`. Zod does emit keys in schema
 * order, but it also STRIPS unknown ones — which would re-open the #2397 data
 * loss that `carryUnauthoredFields` exists to prevent. So this sorts an
 * object's *own* keys and never drops, adds or rewrites a value.
 */

/** A Zod node's internal definition. Narrow, structural, and version-pinned. */
interface ZodDef {
  type: string;
  shape?: Record<string, unknown>;
  element?: unknown;
  valueType?: unknown;
  innerType?: unknown;
  options?: unknown[];
  keyType?: unknown;
  entries?: Record<string, unknown>;
}

function defOf(schema: unknown): ZodDef | undefined {
  return (schema as { _zod?: { def?: ZodDef } } | undefined)?._zod?.def;
}

/**
 * Strip wrapper nodes until a node that carries structure is reached.
 * `optional`, `default`, `nullable`, `readonly` and `catch` all nest under
 * `innerType`, and they stack: `fieldOverridesSchema.validations` is
 * `optional -> optional -> record` (`.partial()` wraps an already-optional
 * field), so this has to loop rather than unwrap once.
 */
function unwrap(schema: unknown): unknown {
  let current = schema;
  for (;;) {
    const inner = defOf(current)?.innerType;
    if (inner === undefined) return current;
    current = inner;
  }
}

/**
 * Pick the union member that describes `value`.
 *
 * Deliberately not discriminator-based: the `elements` union is a plain union
 * whose two members are both shaped `{ ref, overrides }` and differ only in
 * whether `overrides` is a single FieldOverrides (`components/…`) or a
 * fieldId -> FieldOverrides map (`blocks/…`). A `safeParse` probe resolves that
 * and the discriminated cases (processors keyed on `type`) through one path.
 */
function matchUnionMember(options: unknown[], value: unknown): unknown {
  return options.find(
    (option) => (option as z.ZodType).safeParse(value).success,
  );
}

/**
 * Reorder `value`'s own keys to the order `schema` declares them in, recursing
 * into whatever the schema describes. Keys the schema does not enumerate keep
 * their relative order and follow the enumerated ones — except integer-like
 * keys ("2", "10"), which JS always enumerates first on a plain object no
 * matter how they were inserted. That is native behaviour a bare
 * `JSON.stringify(JSON.parse(text))` shows too, it stays idempotent, and the
 * one place a recipe carries author-chosen keys (a block's fieldId-keyed
 * overrides) is `kebabIdSchema`-constrained to a leading letter.
 *
 * A subtree whose schema this cannot read (a `z.pipe`/transform, an unmatched
 * union member) is returned untouched. That is the safe direction — no reorder
 * beats a wrong one — and apps/api's recipe-invariants spec pins both halves
 * over the real corpus: value-preserving, and a fixed point once applied.
 */
function canonicalize(value: unknown, schema: unknown): unknown {
  // JSON has only these shapes, so anything not an object or array is a leaf.
  if (typeof value !== "object" || value === null) return value;

  const def = defOf(unwrap(schema));

  // Resolve a union member BEFORE splitting array from object below: a member
  // may describe either one, so an array-typed member (`processor.type.ts`
  // already has `z.union([z.string(), z.array(...)])`) would otherwise never be
  // reached and its elements would silently keep their key order.
  if (def?.options) {
    const member = matchUnionMember(def.options, value);
    return member ? canonicalize(value, member) : value;
  }

  if (Array.isArray(value)) {
    // Element order is authoring-significant (steps, elements, options), so
    // only the keys *inside* each element are touched.
    return value.map((item) => canonicalize(item, def?.element));
  }

  // Neither a leaf nor an array, so — JSON having no other shapes — a plain
  // object. TS only narrows this far to `object`.
  const record = value as Record<string, unknown>;

  // A record's values share one schema; its keys may or may not have a
  // declared order. `validations` is a partialRecord keyed by the
  // ValidationType *enum*, so its rule names are ordered — while a block
  // element's overrides are keyed by arbitrary fieldIds and must be left alone.
  if (def?.valueType) {
    const keyEntries = defOf(unwrap(def.keyType))?.entries;
    return orderKeys(
      record,
      keyEntries ? Object.keys(keyEntries) : [],
      () => def.valueType,
    );
  }

  const shape = def?.shape;
  if (!shape) return value;

  return orderKeys(record, Object.keys(shape), (key) => shape[key]);
}

/**
 * Rebuild `value` with its own keys in `declared` order, then everything else
 * in its existing relative order. `schemaFor` supplies each key's schema so the
 * recursion continues; an unknown key gets `undefined` and is passed through.
 */
function orderKeys(
  value: Record<string, unknown>,
  declared: string[],
  schemaFor: (key: string) => unknown,
): Record<string, unknown> {
  const own = Object.keys(value);
  const ordered = [
    ...declared.filter((key) => key in value),
    ...own.filter((key) => !declared.includes(key)),
  ];

  return Object.fromEntries(
    ordered.map((key) => [key, canonicalize(value[key], schemaFor(key))]),
  );
}

/**
 * Reorder a recipe's keys into canonical (schema-declared) order, recursively.
 *
 * Value-preserving: the result deep-equals the input. Only key order changes.
 * Takes `unknown` rather than `ServiceContractRecipe` because the callers hold
 * raw parsed JSON that may carry fields the schema does not enumerate — keeping
 * them is the point.
 */
export function canonicalizeRecipe<T>(recipe: T): T {
  return canonicalize(recipe, serviceContractRecipeSchema) as T;
}

/**
 * The exact bytes a recipe file should contain: canonical key order, 2-space
 * indent, trailing newline. Every writer of `recipes/{formId}.json` goes
 * through here so the on-disk form has a single definition.
 */
export function serializeRecipe(recipe: unknown): string {
  return JSON.stringify(canonicalizeRecipe(recipe), null, 2) + "\n";
}
