import type { DocumentNode } from "../../editor/core/module";
import { validatePageSettings } from "../core/pages";

export function validatePageNode(node: DocumentNode): string | undefined {
  const state = node.$;
  const stored = state && typeof state === "object" && !Array.isArray(state) ? state : undefined;
  const widget = node.widget ?? (stored && "widget" in stored ? stored.widget : "page-break");

  if (node.type !== "form-title" && !(node.type === "widget" && widget === "page-break")) return;

  return validatePageSettings(stored && "settings" in stored ? stored.settings : undefined);
}
