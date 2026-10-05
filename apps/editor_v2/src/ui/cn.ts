/*
 * The staff UI primitives in this folder are ported from case-management's
 * `src/ui`, so the editor reads as the same family of admin tools: the
 * `@govtech-bb/design` tokens, its "government-grade craft" chrome, dense
 * tables. `@govtech-bb/react` is for citizen-facing pages — here, only the
 * document canvas, which previews alpha.gov.bb.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
