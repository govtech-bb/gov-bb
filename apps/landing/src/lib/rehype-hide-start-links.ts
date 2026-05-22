import type { Element, ElementContent, Root } from 'hast'

export type RehypeHideStartLinksOptions = {
  hideStartLinks?: boolean
}

const WAYS_TO_APPLY_REGEX = /are (\d+) ways|are ([a-zA-Z]+) ways/i
const WORD_TO_NUMBER: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
}

function rehypeHideStartLinks(options: RehypeHideStartLinksOptions = {}) {
  const { hideStartLinks = false } = options

  return (tree: Root) => {
    if (!hideStartLinks) return

    let removedLinksCount = 0

    const filterChildren = (children: Root['children']): Root['children'] =>
      children
        .filter((node) => {
          if (node.type !== 'element') return true
          const element = node

          if (element.tagName === 'li') {
            if (containsStartLink(element)) {
              removedLinksCount++
              return false
            }
            return true
          }

          if (isStartLink(element)) {
            removedLinksCount++
            return false
          }
          return true
        })
        .map((node) => {
          if (node.type === 'element' && node.children) {
            return {
              ...node,
              children: filterChildren(node.children) as Element['children'],
            }
          }
          return node
        })

    tree.children = filterChildren(tree.children)

    if (removedLinksCount > 0) {
      updateDescriptionText(tree.children, removedLinksCount)
    }
  }
}

function containsStartLink(node: ElementContent): boolean {
  if (node.type !== 'element') return false
  if (isStartLink(node)) return true
  return node.children.some((child) => containsStartLink(child))
}

function isStartLink(element: Element): boolean {
  if (element.tagName !== 'a') return false
  const href = element.properties?.href
  if (typeof href !== 'string') return false
  return href.endsWith('/start')
}

function shouldReplaceDescriptionText(element: Element): boolean {
  if (element.tagName !== 'p') return false
  const textContent = element.children
    .filter((child) => child.type === 'text')
    .map((child) => child.value)
    .join('')
  return WAYS_TO_APPLY_REGEX.test(textContent)
}

function updateDescriptionText(
  children: Root['children'],
  linksRemovedCount: number,
): void {
  for (const node of children) {
    if (node.type !== 'element') continue
    const element = node

    if (shouldReplaceDescriptionText(element)) {
      const textContent = element.children
        .filter((child) => child.type === 'text')
        .map((child) => child.value)
        .join('')

      const newTextContent = textContent.replace(
        WAYS_TO_APPLY_REGEX,
        (match, numberPattern: string, wordPattern: string) => {
          let ways = Number.parseInt(numberPattern, 10)
          if (Number.isNaN(ways) && wordPattern in WORD_TO_NUMBER) {
            ways = WORD_TO_NUMBER[wordPattern]!
          }
          if (Number.isNaN(ways)) {
            return match
          }
          const newWays = Math.max(0, ways - linksRemovedCount)
          if (newWays === 1) return `is ${newWays} way`
          return `are ${newWays} ways`
        },
      )

      element.children = [{ type: 'text', value: newTextContent }]
    }

    if (element.children) {
      updateDescriptionText(element.children, linksRemovedCount)
    }
  }
}

export default rehypeHideStartLinks
