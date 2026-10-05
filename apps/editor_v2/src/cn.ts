import { createCn, validators } from "cn/config";

/**
 * shadcn's `cn` (clsx + tailwind-merge rules), taught this theme: numeric font sizes (`text-14`)
 * and the shadow names. Our font sizes carry no line-height, so they mustn't drop `leading-*`.
 */
export const cn = createCn({
  extend: {
    theme: {
      text: [validators.isNumber],
      shadow: ["input", "input-hover", "input-focus", "input-active", "press", "popup", "sheet"],
    },
  },
  override: { conflictingClassGroups: { "font-size": [] } },
});
