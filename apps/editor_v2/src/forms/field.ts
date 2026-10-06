import type { ResolvedContent } from "./content";
import type { ElementNode, LexicalEditor } from "lexical";
import type { ReactNode } from "react";
import type { EditorModule } from "../editor/core/module";
import type { Settings, Setting } from "./core/settings";
import type { ActionType } from "./core/logic";
import type { FieldStorage, FieldCapabilities, FieldIssue, ReferenceVisitor } from "./core/fields";
import type { FieldSourceHandler } from "./source/field";
import type { FormRegistryEntry } from "./registry/definition";
import type { FormEditorDefinition } from "./definition";
import { immutableData } from "../editor/core/immutable";
import type { NativeFeatureContributions, NativeFieldHandler } from "./native";

export type ChoicePresentation = {
  readonly multiple: boolean;
  readonly createDOM: (index: number, onAdd: () => void) => HTMLElement;
  readonly paint: (dom: HTMLElement, index: number) => void;
};

export type FieldMessageContext = { label: string; optionCount: number; value?: Setting };

export type FieldDefinition<S extends object> = {
  readonly kind: string;
  readonly source: Omit<FieldSourceHandler, "kind" | "mapReferences">;
  readonly settings: { readonly read: (raw: Settings) => S; readonly defaults: Settings };
  readonly label: string;
  readonly untitled: string;
  readonly icon?: ReactNode;
  readonly gutterOffset: number;
  readonly capabilities: FieldCapabilities;
  readonly native?: NativeFieldHandler;
  readonly turnInto?: {
    readonly group: string;
    readonly order: number;
    readonly create: () => ElementNode;
  };
  readonly choice?: ChoicePresentation;
  readonly createDOM?: (settings: S, editor: LexicalEditor) => HTMLElement;
  readonly draw?: (settings: S) => HTMLElement;
  readonly redraw?: (before: S, after: S) => boolean;
  readonly validate?: (settings: S, raw: Settings, where: string) => FieldIssue[];
  readonly options?: (settings: S) => readonly { id: string; label: string }[];
  readonly ownedIds?: (settings: S) => readonly string[];
  readonly copySettings?: (settings: S) => Partial<S>;
  readonly references?: (settings: S, visit: ReferenceVisitor) => Partial<S>;
};

export type ResolvedField = {
  readonly kind: string;
  readonly source: FieldSourceHandler;
  readonly label: string;
  readonly untitled: string;
  readonly icon?: ReactNode;
  readonly gutterOffset: number;
  readonly defaults: Settings;
  readonly capabilities: FieldCapabilities;
  readonly native?: NativeFieldHandler;
  readonly turnInto?: FieldDefinition<object>["turnInto"];
  readonly choice?: ChoicePresentation;
  readonly createDOM?: (raw: Settings, editor: LexicalEditor) => HTMLElement;
  readonly draw?: (raw: Settings) => HTMLElement;
  readonly redraw?: (before: Settings, after: Settings) => boolean;
  readonly validate: (raw: Settings, where: string) => FieldIssue[];
  readonly options?: (raw: Settings) => readonly { id: string; label: string }[];
  readonly ownedIds?: (raw: Settings) => readonly string[];
  readonly copySettings?: (raw: Settings) => Settings;
};

export type StructuralBlock = {
  readonly storage: FieldStorage;
  readonly containerClassName?: string;
};

export type LogicActionDefinition = {
  readonly type: ActionType;
  readonly label: string;
  readonly icon: ReactNode;
  readonly order: number;
};

export type FormModule = EditorModule & {
  readonly validateDefinition?: (definition: FormEditorDefinition) => void;
  readonly nativeCapabilities?: NativeFeatureContributions;
  readonly registry?: readonly FormRegistryEntry[];
  readonly logicActions?: readonly LogicActionDefinition[];
  readonly structural?: readonly StructuralBlock[];
  readonly fields?: readonly ResolvedField[];
  readonly contents?: readonly ResolvedContent[];
  readonly storageFamilies?: readonly { type: string; property: string; defaultValue: string }[];
};

/** Bind custom settings once; registry consumers never cast raw JSON to a field's type. */
export function defineField<S extends { [K in keyof S]: Setting | undefined }>(
  definition: FieldDefinition<S>,
): ResolvedField {
  const { read } = definition.settings;
  const references = definition.references;
  const { createDOM, draw, redraw, validate, options, ownedIds, copySettings } = definition;

  const mapReferences = references
    ? (raw: Settings, visit: ReferenceVisitor): Settings => {
        const copy = structuredClone(raw);
        const patch = references(read(copy), visit);

        for (const key in patch) {
          const value = patch[key];

          if (value === undefined) delete copy[key];
          else copy[key] = value;
        }

        return copy;
      }
    : undefined;

  const source: FieldSourceHandler = {
    ...definition.source,
    storage: immutableData(definition.source.storage),
    attributes: definition.source.attributes && immutableData(definition.source.attributes),
    properties: definition.source.properties && immutableData(definition.source.properties),
    kind: definition.kind,
  };

  if (mapReferences) Object.assign(source, { mapReferences });
  const native = definition.native && { ...definition.native };

  if (native?.config) native.config = immutableData(native.config);

  return Object.freeze({
    kind: definition.kind,
    label: definition.label,
    untitled: definition.untitled,
    icon: definition.icon,
    gutterOffset: definition.gutterOffset,
    source: Object.freeze(source),
    choice: definition.choice && Object.freeze({ ...definition.choice }),
    turnInto: definition.turnInto && Object.freeze({ ...definition.turnInto }),
    defaults: immutableData(definition.settings.defaults),
    capabilities: Object.freeze({
      ...definition.capabilities,
      comparisons: Object.freeze([...definition.capabilities.comparisons]),
    }),
    native: native && Object.freeze(native),
    createDOM:
      createDOM && ((raw: Settings, editor: LexicalEditor) => createDOM(read(raw), editor)),
    options: options && ((raw: Settings) => options(read(raw))),
    ownedIds: ownedIds && ((raw: Settings) => ownedIds(read(raw))),
    copySettings:
      copySettings &&
      ((raw: Settings) => {
        const copy = structuredClone(raw);

        return { ...copy, ...copySettings(read(copy)) };
      }),
    draw: draw && ((raw: Settings) => draw(read(raw))),
    redraw: redraw && ((before: Settings, after: Settings) => redraw(read(before), read(after))),
    validate: (raw: Settings, where: string) => validate?.(read(raw), raw, where) ?? [],
  });
}
