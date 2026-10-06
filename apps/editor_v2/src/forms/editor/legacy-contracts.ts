import type { LexicalNode } from "lexical";
import {
  defineField,
  type FieldDefinition,
  type FieldMessageContext,
  type ResolvedField,
} from "../field";
import { defineContent, type ContentDefinition } from "../content";
import type { Settings, Setting } from "../core/settings";
import type { FieldIssue } from "../core/fields";
import type { FormBlock, FormOption, FormQuestion, FormSection } from "../adapters/ssb/schema";
import type { Rule, RuleName } from "../adapters/ssb/rules";

export type FieldSsbHandler<S> = {
  readonly ref: string;
  readonly settings: (settings: S, raw: Settings) => Settings;
  readonly rules: (settings: S, raw: Settings) => Rule[];
  readonly validateOutput?: (question: FormQuestion) => FieldIssue[];
  readonly project?: (
    settings: S,
    raw: Settings,
  ) => { options: FormOption[]; groups?: FormQuestion["groups"] };
  readonly placeholder?: (settings: S, raw: Settings) => string;
  readonly message?: (rule: RuleName, context: FieldMessageContext) => string | undefined;
};

export type ResolvedFieldSsbHandler = {
  readonly ref: string;
  readonly settings: (raw: Settings) => Settings;
  readonly rules: (raw: Settings) => Rule[];
  readonly validateOutput?: (question: FormQuestion) => FieldIssue[];
  readonly project?: (raw: Settings) => { options: FormOption[]; groups?: FormQuestion["groups"] };
  readonly placeholder?: (raw: Settings) => string;
  readonly message?: FieldSsbHandler<never>["message"];
};

export type LegacyFieldDefinition<S extends object> = FieldDefinition<S> & {
  readonly legacySsb: FieldSsbHandler<S>;
};

export type LegacyContentBlock = Exclude<FormBlock, { type: "question" }>;

export type ContentReadContext = {
  readonly id: string;
  readonly fieldId?: string;
  readonly hidden?: boolean;
  readonly settings: Settings;
  readonly markdown: string;
  readonly $markdown: (node: LexicalNode) => string;
  readonly $id: (node: LexicalNode) => string;
  readonly $settings: (node: LexicalNode) => Settings;
  readonly $listRun: (node: LexicalNode) => LexicalNode[];
  readonly $sectionKind: (node: LexicalNode) => FormSection["ssb"];
};

export type ContentSsbHandler = (
  node: LexicalNode,
  context: ContentReadContext,
) => { entry: LegacyContentBlock; covers: LexicalNode[] };

export type LegacyContentDefinition = ContentDefinition & {
  readonly legacySsb?: ContentSsbHandler;
};

/** Capture callback values so later changes to the declaration cannot alter an installed adapter. */
export function createLegacyFieldHandler<S>(
  read: (raw: Settings) => S,
  handler: FieldSsbHandler<S>,
): ResolvedFieldSsbHandler {
  const { settings, rules, project, placeholder } = handler;

  return Object.freeze({
    ref: handler.ref,
    settings: (raw: Settings) => settings(read(raw), raw),
    rules: (raw: Settings) => rules(read(raw), raw),
    project: project && ((raw: Settings) => project(read(raw), raw)),
    placeholder: placeholder && ((raw: Settings) => placeholder(read(raw), raw)),
    message: handler.message,
    validateOutput: handler.validateOutput,
  });
}

export function withLegacySsbField<T extends ResolvedField>(
  field: T,
  handler: ResolvedFieldSsbHandler | undefined,
) {
  return Object.freeze({ ...field, legacySsb: handler && Object.freeze({ ...handler }) });
}

export function defineLegacyField<S extends { [K in keyof S]: Setting | undefined }>(
  declaration: LegacyFieldDefinition<S>,
) {
  return withLegacySsbField(
    defineField(declaration),
    createLegacyFieldHandler(declaration.settings.read, declaration.legacySsb),
  );
}

export function withLegacySsbContent<T extends ContentDefinition>(
  content: T,
  handler: ContentSsbHandler | undefined,
) {
  return Object.freeze({ ...content, legacySsb: handler });
}

export function defineLegacyContent(declaration: LegacyContentDefinition) {
  return withLegacySsbContent(defineContent(declaration), declaration.legacySsb);
}
