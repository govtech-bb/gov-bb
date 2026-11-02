import type { Root, RootContent } from "hast";
import { isSafeContentUrl } from "#govbbmarkd/content-url";

function sanitizeContentUrls(node: Root | RootContent): void {
  if (node.type === "element") {
    for (const property of ["href", "src"]) {
      const value = node.properties[property];
      if (typeof value === "string" && !isSafeContentUrl(value))
        node.properties[property] = "";
    }
  }
  if ("children" in node)
    for (const child of node.children) sanitizeContentUrls(child);
}

/** Blanks unsafe link/image URLs; deliberately not a raw HTML sanitizer. */
export default function contentUrls() {
  return sanitizeContentUrls;
}
