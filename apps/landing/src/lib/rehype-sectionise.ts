import type { Element, ElementContent, Root } from 'hast'

function rehypeSectionise() {
  return (tree: Root) => {
    const wrapSection = (children: Array<ElementContent>): Element => ({
      type: 'element',
      tagName: 'div',
      properties: {
        className: 'space-y-s',
      },
      children,
    })

    const result: Array<ElementContent> = []
    let buffer: Array<ElementContent> = []

    for (const node of tree.children) {
      if (
        node.type === 'element' &&
        (node.tagName === 'h2' || node.tagName === 'h3')
      ) {
        if (buffer.length > 0) {
          result.push(wrapSection(buffer))
          buffer = []
        }
        buffer.push(node)
      } else if (node.type === 'element' || node.type === 'text') {
        buffer.push(node)
      }
    }

    if (buffer.length > 0) {
      result.push(wrapSection(buffer))
    }

    tree.children = result
  }
}

export default rehypeSectionise
