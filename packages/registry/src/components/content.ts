import type { ContentPrimitive } from "@govtech-bb/form-types";

// A non-field static content block. Recipes override `variant`, `content`
// (markdown body), `summary` (details variant) and `fieldId`. The `label`
// default is never rendered — inset/text show only `content`; details shows
// `summary`.
export const Content: ContentPrimitive = {
  fieldId: "content",
  htmlType: "content",
  label: "Information",
  variant: "text",
  content: "",
};
