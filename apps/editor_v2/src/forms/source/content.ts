import type { FieldStorage, ReferenceVisitor } from "../core/fields";
import type { Settings } from "../core/settings";
import type { SourceContent } from "./model";
import type { RawFieldNode } from "./field";

/** The existing bounded Markdown block shapes, independent of a feature's node or kind. */
export type ContentSyntax =
  | { type: "paragraph" }
  | { type: "heading"; level: 1 | 2 | 3 }
  | { type: "list"; ordered: boolean }
  | { type: "directive"; name: string; nested?: boolean }
  | { type: "json"; name: string };

export type ContentSourceHandler = {
  readonly kind: string;
  readonly storage: FieldStorage;
  readonly syntax: ContentSyntax;
  readonly properties?: readonly string[];
  readonly mapReferences?: (settings: Settings, visit: ReferenceVisitor) => Settings;
  readonly fromNode?: (node: RawFieldNode, content: SourceContent) => SourceContent;
  readonly toNode?: (content: SourceContent, node: RawFieldNode) => RawFieldNode;
};

export function sourceContentForNode(
  contents: readonly ContentSourceHandler[],
  node: RawFieldNode,
) {
  return contents.find(
    (content) =>
      content.storage.type === node.type &&
      (!content.storage.property ||
        (node[content.storage.property] === undefined
          ? content.storage.defaultValue
          : node[content.storage.property]) === content.storage.value),
  );
}

const reservedDirectives = new Set([
  "page",
  "repeat-page",
  "question",
  "option",
  "source-state",
  "state",
  "form",
  "repeat",
  "block",
  "hint",
  "error",
  "description",
  "empty",
  "heading",
  "paragraph",
]);

export function validateContentSyntax(
  contents: readonly ContentSourceHandler[],
  fields: readonly string[] = [],
) {
  for (const kind of fields)
    if (reservedDirectives.has(kind) || !/^[a-z][a-z0-9-]*$/.test(kind))
      throw new Error(`Reserved field syntax: ${kind}`);
  const owners = new Map<string, string>();

  for (const { kind, syntax } of contents) {
    const key =
      syntax.type === "directive" || syntax.type === "json"
        ? `directive:${syntax.name}`
        : syntax.type === "heading"
          ? `heading:${syntax.level}`
          : syntax.type === "list"
            ? `list:${syntax.ordered}`
            : "paragraph";

    if (
      (syntax.type === "directive" || syntax.type === "json") &&
      (reservedDirectives.has(syntax.name) ||
        fields.includes(syntax.name) ||
        !/^[a-z][a-z0-9-]*$/.test(syntax.name))
    )
      throw new Error(`Reserved content syntax: ${syntax.name}`);

    if (owners.has(key))
      throw new Error(`Overlapping content syntax: ${owners.get(key)} and ${kind}`);
    owners.set(key, kind);
  }
}
