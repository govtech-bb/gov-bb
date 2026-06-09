import type { Root, RootContent } from 'hast'

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
        // An authored href wins over form_id, so leave those nodes alone.
        node.properties.href === undefined
      ) {
        node.properties.dataFormId = formId
      }
      walk(node.children)
    }
  }
  walk(tree.children)
}
