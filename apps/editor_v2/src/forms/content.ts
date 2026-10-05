import type { ReactNode } from "react";
import type { ElementNode } from "lexical";
import { immutableData } from "../editor/core/immutable";
import type { Settings } from "./core/settings";
import type { ReferenceVisitor } from "./core/fields";
import type { ContentSourceHandler } from "./source/content";
import type { NativeContentHandler } from "./native";

export type ContentDefinition = {
  readonly kind: string;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly source: Omit<ContentSourceHandler, "kind" | "mapReferences">;
  readonly native?: NativeContentHandler;
  readonly turnInto?: {
    readonly kind: string;
    readonly order: number;
    readonly create: () => ElementNode;
  };
  readonly references?: (settings: Settings, visit: ReferenceVisitor) => Settings;
  readonly fieldId?: (text: string) => string;
};

export type ResolvedContent = ReturnType<typeof defineContent>;

export function defineContent(definition: ContentDefinition) {
  const references = definition.references;

  const mapReferences = references
    ? (settings: Settings, visit: ReferenceVisitor) => references(structuredClone(settings), visit)
    : undefined;

  const native = definition.native && { ...definition.native };

  if (native?.config) native.config = immutableData(native.config);

  const source: ContentSourceHandler = {
    ...definition.source,
    kind: definition.kind,
    storage: immutableData(definition.source.storage),
    syntax: immutableData(definition.source.syntax),
    properties: definition.source.properties && immutableData(definition.source.properties),
  };

  if (mapReferences) Object.assign(source, { mapReferences });

  return Object.freeze({
    ...definition,
    native: native && Object.freeze(native),
    turnInto: definition.turnInto && Object.freeze({ ...definition.turnInto }),
    source: Object.freeze(source),
  });
}
