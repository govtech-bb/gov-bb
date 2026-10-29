import type { Root, RootContent } from 'hast'

/** Binds the page’s linked form without replacing an explicit URL or form target. */
export function bakeStartLinkFormId(
  tree: Root,
  formId: string | undefined,
): void {
  if (!formId) return
  const walk = (nodes: Array<RootContent>): void => {
    for (const node of nodes) {
      if (node.type !== 'element') continue
      if (
        node.tagName === 'a' &&
        node.properties.dataStartLink !== undefined &&
        // Authored destinations win over the page’s form_id.
        node.properties.href === undefined &&
        node.properties.dataFormId === undefined
      ) {
        node.properties.dataFormId = formId
      }
      walk(node.children)
    }
  }
  walk(tree.children)
}
