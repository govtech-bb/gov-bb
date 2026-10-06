import type { FieldStorage, ReferenceVisitor } from "../core/fields";
import type { Settings } from "../core/settings";
import type { SourceQuestion } from "./model";

export type RawFieldNode = { type: string; children?: RawFieldNode[]; [key: string]: unknown };

export type FieldSourceHandler = {
  readonly kind: string;
  readonly storage: FieldStorage;
  readonly choice?: boolean;
  readonly referencesOptions?: boolean;
  readonly attributes?: Readonly<Record<string, "string" | "number" | "boolean">>;
  readonly properties?: readonly string[];
  readonly mapReferences?: (settings: Settings, visit: ReferenceVisitor) => Settings;
  /** Adapt an owned answer payload around the shared question/identity construction. */
  readonly fromNode?: (node: RawFieldNode, question: SourceQuestion) => SourceQuestion;
  readonly toNode?: (question: SourceQuestion, node: RawFieldNode) => RawFieldNode;
};

export function sourceFieldForNode(fields: readonly FieldSourceHandler[], node: RawFieldNode) {
  return fields.find(
    (field) =>
      field.storage.type === node.type &&
      (!field.storage.property ||
        (node[field.storage.property] === undefined
          ? field.storage.defaultValue
          : node[field.storage.property]) === field.storage.value),
  );
}
