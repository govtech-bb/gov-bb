/**
 * Whether to strip a page's online-application method — the element (or
 * enclosing `<li>`) hosting its `data-start-link` CTA — and rewrite its
 * "There are N ways…" count down (see rehype-hide-start-links).
 *
 * True when either:
 * - the viewer cannot see the page's `/start` sub-page (markdown-frontmatter
 *   gating, via registry `isStartSubPageVisible`), or
 * - the page has a `form_id` that is absent from the available-forms list for
 *   this viewer. That list excludes every non-public recipe — `preview`,
 *   `draft`, and `maintenance` — so all of them hide the online method for the
 *   public, matching how `StartLink` already gates a formId-based button. A
 *   reviewer keeps it: the loader adds a token-accessible form back to the list.
 *
 * `maintenance` differs from `preview` only in also rendering the notice; that
 * is decided separately by the route, not here.
 */
export function shouldHideStartLink({
  startSubPageVisible,
  formId,
  availableForms,
}: {
  startSubPageVisible: boolean
  formId: string | undefined
  availableForms: readonly string[]
}): boolean {
  if (!startSubPageVisible) return true
  return formId !== undefined && !availableForms.includes(formId)
}
