import type { Root, RootContent } from 'hast'

/**
 * Stamp the page's `form_id` (from frontmatter) onto its `data-start-link`
 * anchors as `data-form-id`, so the runtime start-link reads its target from
 * the node instead of a React context threaded through the render. Anchors with
 * an authored `href` are left alone — an authored href wins over `form_id`.
 * Mutates in place; the registry runs it once per page.
 */
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
        node.properties.href === undefined
      ) {
        node.properties.dataFormId = formId
      }
      walk(node.children)
    }
  }
  walk(tree.children)
}
