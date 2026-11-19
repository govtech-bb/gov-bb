/** A browser tab's title, the most specific name first: “Entry page – Renew a passport – GovBB editor”. */
export function screenTitle(...names: (string | undefined)[]) {
  return [...names, "GovBB editor"].filter(Boolean).join(" – ");
}

/**
 * Names the browser tab after the screen, so several open tabs can be told apart. Rendered anywhere on the screen:
 * React puts it in the document's head, ahead of the editor's own name.
 */
export function ScreenTitle({ names }: { names: (string | undefined)[] }) {
  return <title>{screenTitle(...names)}</title>;
}
