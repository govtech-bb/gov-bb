/** Whether this is a Mac, where the editor's shortcuts use ⌘ and ⌥ for what is Ctrl and Alt elsewhere. */
export const isMac = /Mac|iPhone|iPad/.test(globalThis.navigator?.userAgent ?? "");

/** The Alt key's name, for "Option-click" and the like. */
export const altKey = isMac ? "Option" : "Alt";

const mac = new Map([
  ["mod", "⌘"],
  ["shift", "⇧"],
  ["alt", "⌥"],
  ["enter", "↵"],
  ["delete", "⌫"],
]);

const other = new Map([
  ["mod", "Ctrl"],
  ["shift", "Shift"],
  ["alt", "Alt"],
  ["enter", "Enter"],
  ["delete", "Del"],
]);

/**
 * A shortcut as the platform writes it: ["mod", "shift", "h"] is ⌘⇧H on a Mac and Ctrl+Shift+H elsewhere. "mod" is
 * the key the editor binds as ⌘ on a Mac and Ctrl elsewhere; "delete" is the key that deletes, ⌫ on a Mac.
 */
export function shortcut(keys: readonly string[]) {
  const names = isMac ? mac : other;
  const parts = keys.map((key) => names.get(key) ?? key.toUpperCase());

  return parts.join(isMac ? "" : "+");
}

/**
 * Whether a key press is a shortcut in shortcut()'s terms. A digit goes by the key pressed rather than the character
 * typed, as Option and Shift change what a digit key types.
 */
export function pressedShortcut(
  event: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  keys: readonly string[],
) {
  const key = keys.at(-1) ?? "";
  const held = new Set(keys.slice(0, -1));

  return (
    (isMac ? event.metaKey : event.ctrlKey) === held.has("mod") &&
    !(isMac ? event.ctrlKey : event.metaKey) &&
    event.altKey === held.has("alt") &&
    event.shiftKey === held.has("shift") &&
    (/^\d$/.test(key) ? event.code === `Digit${key}` : event.key.toLowerCase() === key)
  );
}
