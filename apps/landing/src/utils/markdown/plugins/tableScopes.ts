import type { Element, Root } from 'hast'

/**
 * Give markdown tables the scopes the design system's Table styles key off.
 *
 * The GOV.BB table pattern (Figma "Table/component") treats a row's first cell
 * as its header: pale-blue fill, semibold, white separator. The design system
 * paints that from `tbody th`, but GFM emits every body cell as a plain `<td>`,
 * so a markdown table would render without it. Promote the first cell of each
 * body row to `<th scope="row">`, and mark the header row's cells `scope="col"`.
 *
 * The row header is also the accessible one: a screen reader announces it with
 * each cell in the row, so "55" is read as belonging to "Before 15 July 1985".
 */
function rehypeTableScopes() {
  return (tree: Root) => visit(tree)
}

function visit(node: Root | Element): void {
  for (const child of node.children) {
    if (child.type !== 'element') continue
    if (child.tagName === 'table') applyScopes(child)
    else visit(child)
  }
}

function applyScopes(table: Element): void {
  for (const section of table.children) {
    if (section.type !== 'element') continue
    const isHead = section.tagName === 'thead'
    if (!isHead && section.tagName !== 'tbody') continue

    for (const row of section.children) {
      if (row.type !== 'element' || row.tagName !== 'tr') continue
      const cells = row.children.filter(
        (cell): cell is Element => cell.type === 'element',
      )
      if (isHead) {
        for (const cell of cells) {
          cell.properties = { ...cell.properties, scope: 'col' }
        }
        continue
      }
      const [first] = cells
      if (!first) continue
      first.tagName = 'th'
      first.properties = { ...first.properties, scope: 'row' }
    }
  }
}

export default rehypeTableScopes
