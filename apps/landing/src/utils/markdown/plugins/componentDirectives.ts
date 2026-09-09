import { isSafeContentUrl } from '@govtech-bb/content/markdown-authoring'

type DirectiveNode = {
  type: 'containerDirective' | 'leafDirective' | 'textDirective'
  name: string
  attributes?: Record<string, string> | null
  children?: DirectiveTreeNode[]
  data?: {
    hName?: string
    hProperties?: Record<string, unknown>
  }
}

type DirectiveTreeNode = {
  type: string
  value?: string
  children?: DirectiveTreeNode[]
  name?: string
  attributes?: Record<string, string> | null
  data?: DirectiveNode['data']
}

const DIRECTIVE_TYPES = new Set([
  'containerDirective',
  'leafDirective',
  'textDirective',
])
const COMPONENT_DIRECTIVES = new Set(['notice', 'actions', 'action', 'details'])

function isDirective(node: DirectiveTreeNode): node is DirectiveNode {
  return DIRECTIVE_TYPES.has(node.type) && typeof node.name === 'string'
}

function attributesOf(node: DirectiveNode): Record<string, string> {
  return node.attributes ?? {}
}

function assertAttributes(
  node: DirectiveNode,
  allowed: ReadonlySet<string>,
): Record<string, string> {
  const attributes = attributesOf(node)
  const invalid = Object.keys(attributes).find((name) => !allowed.has(name))
  if (invalid) {
    throw new Error(
      `[markdown] ::${node.name} does not support the “${invalid}” attribute`,
    )
  }
  return attributes
}

function transformDirective(
  node: DirectiveNode,
  parent: DirectiveTreeNode | undefined,
): void {
  node.data ??= {}

  if (node.name === 'notice' && node.type === 'containerDirective') {
    assertAttributes(node, new Set())
    node.data.hName = 'notice'
    return
  }

  if (node.name === 'actions' && node.type === 'containerDirective') {
    assertAttributes(node, new Set())
    const invalidChild = node.children?.find(
      (child) => isDirective(child) && child.name !== 'action',
    )
    if (invalidChild && isDirective(invalidChild)) {
      throw new Error(
        `[markdown] ::${invalidChild.name} cannot be nested inside :::actions`,
      )
    }
    node.data.hName = 'buttons'
    return
  }

  if (node.name === 'action' && node.type === 'leafDirective') {
    if (!parent || !isDirective(parent) || parent.name !== 'actions') {
      throw new Error('[markdown] ::action must be inside an :::actions block')
    }
    const attributes = assertAttributes(node, new Set(['href', 'variant']))
    const href = attributes.href?.trim()
    if (!href || !isSafeContentUrl(href)) {
      throw new Error('[markdown] ::action requires a safe href attribute')
    }
    const variant = attributes.variant || 'primary'
    if (variant !== 'primary' && variant !== 'secondary') {
      throw new Error(
        '[markdown] ::action variant must be “primary” or “secondary”',
      )
    }
    node.data.hName = 'link-button'
    node.data.hProperties = {
      href,
      ...(variant === 'secondary' ? { variant } : {}),
    }
    return
  }

  if (node.name === 'details' && node.type === 'containerDirective') {
    const attributes = assertAttributes(node, new Set(['summary']))
    const summary = attributes.summary?.trim()
    if (!summary) {
      throw new Error('[markdown] :::details requires a summary attribute')
    }
    node.data.hName = 'show-hide'
    node.data.hProperties = { summary }
    return
  }

  throw new Error(`[markdown] Unsupported component directive ::${node.name}`)
}

function walk(node: DirectiveTreeNode, parent?: DirectiveTreeNode): void {
  if (isDirective(node)) {
    const isBareInlineText =
      node.type === 'textDirective' &&
      !COMPONENT_DIRECTIVES.has(node.name) &&
      Object.keys(attributesOf(node)).length === 0 &&
      (node.children?.length ?? 0) === 0
    if (isBareInlineText && parent?.children) {
      const index = parent.children.indexOf(node)
      parent.children[index] = { type: 'text', value: `:${node.name}` }
      return
    }
    transformDirective(node, parent)
  }
  for (const child of node.children ?? []) walk(child, node)
}

export default function componentDirectives() {
  return (tree: DirectiveTreeNode) => walk(tree)
}
