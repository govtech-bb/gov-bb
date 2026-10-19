/**
 * The global focus ring (a teal outline over an ink edge) drawn on an element whose own control is visually hidden
 * inside it, such as a radio under its label or a see-through select over its caption.
 */
export const hiddenControlFocus =
  "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus has-[:focus-visible]:shadow-[0_0_0_2px_var(--color-ink)]";
