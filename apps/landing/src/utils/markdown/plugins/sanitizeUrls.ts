import type { Root, RootContent } from 'hast'

const SAFE_PROTOCOL = /^(https?|ircs?|mailto|tel|xmpp)$/i

// react-markdown@9's defaultUrlTransform: blanks URLs whose protocol isn't on
// the safe list (e.g. javascript:). `tel` is added to react-markdown's list —
// content links phone numbers as `[(246) 536-3800](tel:+12465363800)` and the
// upstream list omits `tel:`, which blanked every one of those hrefs.
function defaultUrlTransform(value: string): string {
  const colon = value.indexOf(':')
  const questionMark = value.indexOf('?')
  const numberSign = value.indexOf('#')
  const slash = value.indexOf('/')

  if (
    colon < 0 ||
    (slash > -1 && colon > slash) ||
    (questionMark > -1 && colon > questionMark) ||
    (numberSign > -1 && colon > numberSign) ||
    SAFE_PROTOCOL.test(value.slice(0, colon))
  ) {
    return value
  }

  return ''
}

const URL_PROPERTIES = ['href', 'src'] as const

function sanitize(node: RootContent): void {
  if (node.type === 'element') {
    for (const prop of URL_PROPERTIES) {
      const value = node.properties[prop]
      if (typeof value === 'string') {
        node.properties[prop] = defaultUrlTransform(value)
      }
    }
    for (const child of node.children) sanitize(child)
  }
}

export default function rehypeSanitizeUrls() {
  return (tree: Root) => {
    for (const child of tree.children) sanitize(child)
  }
}
