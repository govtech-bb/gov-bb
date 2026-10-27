import { fieldOverridesSchema } from "./primitive.type";

const ALLOWED = new Set(Object.keys(fieldOverridesSchema.shape));

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * `fieldOverridesSchema` is not strict, so an override key it doesn't know is
 * stripped at parse and silently has no effect (#2713). It stays non-strict on
 * purpose — it also parses at API boot, builder draft load and AI output, where
 * strict would turn a leftover key into an outage — so `pnpm validate-recipes`
 * runs this guard instead. Takes the RAW recipe JSON: after a schema parse the
 * keys are already gone. Returns human-readable error strings (empty when clean).
 */
export function checkOverrideKeys(recipe: unknown): string[] {
  const errors: string[] = [];
  const steps = isObj(recipe) ? arr(recipe.steps) : [];
  for (const step of steps.filter(isObj)) {
    for (const el of arr(step.elements).filter(isObj)) {
      if (!isObj(el.overrides)) continue;
      const ref = String(el.ref);
      // A block's overrides are keyed by its child fieldIds.
      const targets: [string, Obj][] = ref.startsWith("blocks/")
        ? Object.entries(el.overrides).filter((e): e is [string, Obj] =>
            isObj(e[1]),
          )
        : [[String(el.overrides.fieldId ?? ref), el.overrides]];
      for (const [fieldId, overrides] of targets) {
        for (const key of Object.keys(overrides)) {
          if (!ALLOWED.has(key)) {
            errors.push(
              `step "${String(step.stepId)}" › field "${fieldId}" › unknown override key "${key}" — dropped at parse, it has no effect`,
            );
          }
        }
      }
    }
  }
  return errors;
}
