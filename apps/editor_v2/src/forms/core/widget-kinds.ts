/** Legacy storage kinds, independent of which React renderers are mounted. */
export const widgetKinds = [
  "calculated-fields",
  "conditional-logic",
  "file-upload",
  "opening-hours",
  "checkbox-accordion",
  "page-break",
] as const;

export type WidgetKind = string;
