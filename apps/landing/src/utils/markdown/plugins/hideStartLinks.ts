import type { Element, ElementContent, Root } from 'hast'

type RehypeHideStartLinksOptions = {
  /**
   * When true, remove the page's online-application method — the element (or
   * enclosing `<li>`) containing a `data-start-link` CTA — and rewrite the
   * "There are N ways…" count down by the number of methods removed. Driven by
   * the route: it is set for a visitor whose level cannot see the `/start`
   * sub-page (see registry `isStartSubPageVisible`). Left false for everyone
   * else, in which case the plugin is a no-op.
   */
  hideStartLink?: boolean
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

function isDataStartLink(node: ElementContent): boolean {
  return (
    node.type === 'element' &&
    node.tagName === 'a' &&
    node.properties?.dataStartLink !== undefined
  )
}

function containsDataStartLink(node: ElementContent): boolean {
  if (node.type !== 'element') return false
  if (isDataStartLink(node)) return true
  return node.children.some(containsDataStartLink)
}

function rehypeHideStartLinks(options: RehypeHideStartLinksOptions = {}) {
  const { hideStartLink = false } = options

  return (tree: Root) => {
    if (!hideStartLink) return

    let removedCount = 0

    const filterChildren = (children: Root['children']): Root['children'] =>
      children
        .filter((node) => {
          if (node.type !== 'element') return true
          // Drop a whole list item that hosts the online method, otherwise an
          // orphaned heading/blurb would be left behind.
          if (node.tagName === 'li') {
            if (containsDataStartLink(node)) {
              removedCount++
              return false
            }
            return true
          }
          // A data-start-link not wrapped in a list item: drop just the anchor.
          if (isDataStartLink(node)) {
            removedCount++
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

    if (removedCount > 0) {
      updateDescriptionText(tree.children, removedCount)
    }
  }
}

function isWaysParagraph(element: Element): boolean {
  if (element.tagName !== 'p') return false
  const text = element.children
    .filter((child) => child.type === 'text')
    .map((child) => child.value)
    .join('')
  return WAYS_TO_APPLY_REGEX.test(text)
}

/** Rewrite "There are N ways…" → "…is 1 way" / "…are M ways" after removals. */
function updateDescriptionText(
  children: Root['children'],
  removedCount: number,
): void {
  for (const node of children) {
    if (node.type !== 'element') continue
    const element = node

    if (isWaysParagraph(element)) {
      const text = element.children
        .filter((child) => child.type === 'text')
        .map((child) => child.value)
        .join('')

      const next = text.replace(
        WAYS_TO_APPLY_REGEX,
        (match, numberPattern: string, wordPattern: string) => {
          let ways = Number.parseInt(numberPattern, 10)
          if (Number.isNaN(ways) && wordPattern in WORD_TO_NUMBER) {
            ways = WORD_TO_NUMBER[wordPattern]!
          }
          if (Number.isNaN(ways)) return match
          const newWays = Math.max(0, ways - removedCount)
          return newWays === 1 ? `is ${newWays} way` : `are ${newWays} ways`
        },
      )

      element.children = [{ type: 'text', value: next }]
    }

    if (element.children) {
      updateDescriptionText(element.children, removedCount)
    }
  }
}

export default rehypeHideStartLinks
