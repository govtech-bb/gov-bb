/**
 * The global focus ring (a teal outline over an ink edge) drawn on an element whose own control is visually hidden
 * inside it, such as a radio under its label or a see-through select over its caption.
 */
export const hiddenControlFocus =
  "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus has-[:focus-visible]:shadow-[0_0_0_2px_var(--color-ink)]";

// How the last press on the page was made: a pointer's type, such as "touch", or "keyboard". Base UI knows how its own
// trigger opened a popup; a popup opened from state, such as by a button's own handler, goes by this. Not on the server
let lastPress = "";

globalThis.document?.addEventListener(
  "pointerdown",
  (event) => {
    lastPress = event.pointerType;
  },
  true,
);

globalThis.document?.addEventListener(
  "keydown",
  () => {
    lastPress = "keyboard";
  },
  true,
);

/** Whether the last press was a finger's, after which focusing a field would bring up the keyboard uninvited. */
export const pressedByTouch = () => lastPress === "touch";

/**
 * Whether a popup opened by a touch, so it takes the focus itself rather than its first field. Base UI passes the open
 * type to `initialFocus`, or none for a popup opened from state.
 */
export const openedByTouch = (openType: string) =>
  openType === "touch" || (openType === "" && pressedByTouch());
