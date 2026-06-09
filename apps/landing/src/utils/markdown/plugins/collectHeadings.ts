import type { ElementContent, Root, RootContent } from 'hast'

export type MarkdownHeading = {
  id: string
  text: string
  level: number
}

const HEADING_TAGS = new Set(['h2', 'h3'])

function textOf(node: ElementContent): string {
  if (node.type === 'text') return node.value
  if (node.type === 'element') return node.children.map(textOf).join('')
  return ''
}

// Run after rehype-slug (needs ids) and before rehype-autolink-headings (so
// text excludes the appended `#`).
export function collectHeadings(headings: Array<MarkdownHeading>) {
  const walk = (nodes: Array<RootContent>): void => {
    for (const node of nodes) {
      if (node.type !== 'element') continue
      if (HEADING_TAGS.has(node.tagName)) {
        const id = node.properties.id
        if (typeof id === 'string' && id) {
          headings.push({
            id,
            text: textOf(node).trim(),
            level: Number(node.tagName.slice(1)),
          })
        }
      }
      walk(node.children)
    }
  }
  return (tree: Root) => walk(tree.children)
}
