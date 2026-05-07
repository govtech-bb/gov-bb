import jsonLogic from "json-logic-js";
import type { ResolutionContext } from "./types";

/**
 * If `value` is a JSONLogic rule (recognised by `jsonLogic.is_logic`), evaluate
 * it via `jsonLogic.apply()`. Otherwise return `value` unchanged.
 *
 * Callers must pass schema-validated input. The `dynamic()` Zod helper (in
 * @govtech-bb/form-types) ensures field values are either a literal of the
 * declared type OR a JSONLogic rule shape — there is no third case to handle.
 *
 * If `is_logic` returns true and `apply()` throws, that indicates a malformed
 * rule (e.g. unknown operator). Such errors propagate — they signal a real
 * problem in the form definition, not a path to swallow.
 *
 * Custom operations must be registered via `registerOperations` before this
 * function is called.
 */
export function applyIfRule(value: unknown, ctx: ResolutionContext): unknown {
  if (jsonLogic.is_logic(value)) {
    return jsonLogic.apply(value as Parameters<typeof jsonLogic.apply>[0], ctx);
  }
  return value;
}
