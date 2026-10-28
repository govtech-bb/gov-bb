import { createCn, validators } from "cn/config";

/**
 * shadcn's `cn` (clsx + tailwind-merge rules), taught this theme: numeric font sizes (`text-14`), the shadow names
 * and the layers (`z-popup`). A `leading-*` overrides a size's own line-height, so a size mustn't drop it.
 */
export const cn = createCn({
  extend: {
    theme: {
      text: [validators.isNumber],
      shadow: [
        "input",
        "input-hover",
        "input-focus",
        "input-active",
        "input-error",
        "press",
        "popup",
        "sheet",
      ],
    },
    classGroups: { z: [{ z: ["canvas", "bar", "popup", "tooltip", "toast"] }] },
  },
  override: { conflictingClassGroups: { "font-size": [] } },
});
