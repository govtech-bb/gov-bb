import { createCn, validators } from "cn/config";

/**
 * Merges classes using the editor's font sizes, shadows, easing and z-index tokens.
 * Font sizes preserve explicit `leading-*` overrides.
 */
export const cn = createCn({
  extend: {
    theme: {
      text: [validators.isNumber],
      shadow: ["input", "input-hover", "input-focus", "input-error", "press", "popup", "sheet"],
      ease: ["out-quint"],
    },
    classGroups: { z: [{ z: ["canvas", "bar", "popup", "tooltip", "toast"] }] },
  },
  override: { conflictingClassGroups: { "font-size": [] } },
});
