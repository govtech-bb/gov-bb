import type { Root } from "hast";
import { bakeStartLinkFormId } from "./plugins/bakeStartLinkFormId.js";
import { processMarkdown } from "./processor.js";

/** Stored beside each compiled page; bump when the compiled output changes. */
export const COMPILER_VERSION = "1";

type TreeNode = { position?: unknown; children?: TreeNode[] };

function stripPosition(node: TreeNode): void {
  delete node.position;
  for (const child of node.children ?? []) stripPosition(child);
}

/** v1's markdown pipeline plus sanitizing, with the start link baked for
 *  `formId` and no position data. */
export async function compilePage(
  markdown: string,
  formId?: string,
): Promise<Root> {
  const { hast } = await processMarkdown(markdown);
  bakeStartLinkFormId(hast, formId);
  stripPosition(hast);
  return hast;
}
