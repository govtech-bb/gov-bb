import type { StatusTone } from "../ui/status-dot";

// Live is green, link-only is amber, draft is grey; the label always travels with the colour.
export const visibilityTones = new Map<string, StatusTone>([
  ["", "success"],
  ["public", "success"],
  ["preview", "warning"],
  ["draft", "neutral"],
]);

export const visibilityLabels = new Map([
  ["", "Public"],
  ["public", "Public"],
  ["preview", "Preview link only"],
  ["draft", "Draft (hidden)"],
]);
