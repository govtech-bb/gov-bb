import {
  isPageDirective,
  parsePageComponent,
  type PageMarkdownComponent,
} from "@govtech-bb/govbbmarkd";
import { $createParagraphNode } from "lexical";
import type {
  EditorAction,
  EditorSlotContribution,
  DocumentNodeDefinition,
  EditorRegistration,
} from "@/editor";
import { defineSlot } from "@/editor/react";
import type { MarkdownNode, PageHandler, PageModule } from "../definition";
import { blocks, UnsupportedPageContent } from "../markdown";
import { BLOCK_OPTIONS, type BlockOption, type BlockOptionsProps } from "./block-options";
import {
  PageComponentNode,
  registerBlockKind,
  type BlockKind,
  type PageComponentAttributes,
  type PageComponentKind,
} from "./node";
import "./block.css";

/** A kind of page component a block is made of: its kinds, Markdown, insertion and options, in one place. */
export type BlockDefinition = {
  /** Names the block's editor module, unique in a page editor. */
  readonly key: string;
  /** The kinds of component it's made of, and how each behaves. */
  readonly kinds: readonly BlockKind[];
  /** How its Markdown reads into its components and is written back. */
  readonly markdown: readonly PageHandler[];
  /** Its entries in the insert and "/" menus (see pageInsertAction). */
  readonly insert?: readonly EditorAction[];
  /** Its Block options, for the component at the caret. */
  readonly options?: readonly BlockOption[];
  /** Its own editing behaviour, such as what its keys do. */
  readonly registrations?: readonly EditorRegistration[];
  /** What it adds around the page, such as a popover. */
  readonly slots?: readonly EditorSlotContribution[];
};

// Every block's components are the one node, so each block's module declares the same declaration of it
const componentNode: DocumentNodeDefinition = { type: "page-component", node: PageComponentNode };

/**
 * A page block, as an editor module: its kinds join the page's components, and the module brings its Markdown, menu
 * entries, options and editing. List it in ./index.ts.
 */
export function defineBlock(block: BlockDefinition): PageModule {
  for (const kind of block.kinds) registerBlockKind(kind);

  return {
    key: block.key,
    requires: ["text"],
    nodes: [componentNode],
    markdown: block.markdown,
    actions: block.insert ?? [],
    registrations: block.registrations ?? [],
    slots: [
      ...(block.slots ?? []),
      ...(block.options ?? []).map(({ kinds, Options }, index) =>
        defineSlot<BlockOptionsProps>(`${block.key}-options-${index}`, BLOCK_OPTIONS, (props) =>
          kinds.includes(props.component.kind) ? <Options {...props} /> : null,
        ),
      ),
    ],
  };
}

type Component<Kind> = Extract<PageMarkdownComponent, { kind: Kind }>;

const isKind = <Kind extends PageMarkdownComponent["kind"]>(
  component: PageMarkdownComponent,
  kind: Kind,
): component is Component<Kind> => component.kind === kind;

/** The dialect's component in a directive; anything else is source-only. */
export function $parseDirective<Kind extends PageMarkdownComponent["kind"]>(
  node: MarkdownNode,
  kind: Kind,
): Component<Kind> {
  if (!isPageDirective(node)) throw new UnsupportedPageContent(node);
  const parsed = parsePageComponent(node);

  // Lexical's synchronous import boundary translates this into a source-only draft.
  if (!parsed.ok) throw new UnsupportedPageContent(node, parsed.error.message);

  if (!isKind(parsed.value, kind)) throw new UnsupportedPageContent(node);

  return parsed.value;
}

/** How a block's directive and its component correspond; each part has a default. */
type DirectiveSpec<Kind> = {
  /** The component's attributes, from the parsed directive; none by default. */
  readonly attributes?: (component: Component<Kind>) => PageComponentAttributes;
  /** What the component holds; the directive's body by default. */
  readonly children?: (component: Component<Kind>) => readonly MarkdownNode[];
  /** The directive's label, from the component's attributes, such as a Details summary. */
  readonly label?: (attributes: PageComponentAttributes) => string | undefined;
  /** The directive's attributes, from the component's. */
  readonly directiveAttributes?: (
    attributes: PageComponentAttributes,
  ) => Record<string, string | undefined>;
};

/** A block written as a container directive of the dialect, such as `:::details[Summary]`. */
export function directive<Kind extends PageMarkdownComponent["kind"] & PageComponentKind>(
  kind: Kind,
  spec: DirectiveSpec<Kind> = {},
): PageHandler {
  return {
    accepts: (node) => isPageDirective(node) && node.name === kind,
    owns: (node) => node instanceof PageComponentNode && node.getKind() === kind,
    $import(node, context) {
      const component = $parseDirective(node, kind);
      const result = new PageComponentNode(kind, spec.attributes?.(component) ?? {});
      const children = spec.children?.(component) ?? ("body" in component ? component.body : []);

      result.append(...children.flatMap((child) => context.$import(child)));

      if (!result.getChildrenSize()) result.append($createParagraphNode());

      return [result];
    },
    $export(node, context) {
      if (!(node instanceof PageComponentNode)) throw new Error("Expected a page component");
      const data = node.getAttributes();
      const body = blocks(node.getChildren().flatMap((child) => context.$export(child)));
      const label = spec.label?.(data);

      if (label !== undefined)
        body.unshift({
          type: "paragraph",
          data: { directiveLabel: true },
          children: [{ type: "text", value: label }],
        });

      return [
        {
          type: "containerDirective",
          name: kind,
          attributes: spec.directiveAttributes?.(data) ?? {},
          children: body,
        },
      ];
    },
  };
}
