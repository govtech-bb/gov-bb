export type PageType = "questions" | "check-answers" | "declaration" | "confirmation" | "result";

const pageSettings = new Set([
  "field",
  "sourceKey",
  "sourceExplicit",
  "sourceFieldId",
  "sourceLabel",
  "sourcePreset",
  "sourceUnknown",
  "sourceNode",
  "ref",
  "folded",
  "logicVersion",
  "name",
  "pageId",
  "hidden",
  "confirmation",
  "pageType",
  "button",
  "backButton",
  "repeatable",
  "formSettings",
]);

/** Page purpose is validated before hydration so unsupported settings cannot become ordinary pages. */
export function validatePageSettings(value: unknown): string | undefined {
  if (value === undefined) return;

  if (!value || typeof value !== "object" || Array.isArray(value))
    return "Page settings must be an object";

  for (const key of Object.keys(value))
    if (!pageSettings.has(key)) return `Unsupported page setting: ${key}`;

  if ("confirmation" in value && typeof value.confirmation !== "boolean")
    return "The confirmation page setting must be a boolean";

  if (
    "pageType" in value &&
    (typeof value.pageType !== "string" ||
      !["questions", "check-answers", "declaration", "result"].includes(value.pageType))
  )
    return "Unsupported page type setting";
}
