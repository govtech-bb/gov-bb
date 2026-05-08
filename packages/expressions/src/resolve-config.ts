import type { ResolutionContext } from "./types";
import { applyIfRule } from "./apply-if-rule";

/**
 * Iterates the direct fields of a config object, applying `applyIfRule` to each
 * field's value. Each field is either a literal (passes through) or a JSONLogic
 * rule (gets evaluated). No recursion into nested containers — authors mark
 * dynamic fields explicitly in the processor's schema (see `dynamic()` helper
 * in @govtech-bb/form-types).
 */
export function resolveConfig(
  config: Record<string, unknown>,
  ctx: ResolutionContext,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(config).map(([k, v]) => [k, applyIfRule(v, ctx)]),
  );
}
