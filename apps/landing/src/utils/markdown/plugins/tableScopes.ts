import type { Element, Root } from 'hast'

/**
 * Mark markdown tables' header cells `scope="col"`.
 *
 * GFM emits a bare `<th>`, which leaves a screen reader to infer what the cell
 * heads. Row headers are deliberately not inferred: markdown cannot express
 * one, and guessing that a table's first column labels its row would mislabel
 * any table whose first column is data. A table that genuinely wants row
 * headers should be authored as HTML — `rehype-raw` is already in the pipeline.
 */
function rehypeTableScopes() {
  return (tree: Root) => visit(tree)
}

function visit(node: Root | Element): void {
  for (const child of node.children) {
    if (child.type !== 'element') continue
    if (child.tagName === 'th') {
      child.properties = { scope: 'col', ...child.properties }
    } else {
      visit(child)
    }
  }
}

export default rehypeTableScopes
