import type { LexicalNode } from "lexical";
import type { RootContent, PhrasingContent } from "mdast";
import type { ReactNode } from "react";
import { defineEditor } from "../editor/core/definition";
import type { EditorModule } from "../editor/core/module";

export type MarkdownNode = RootContent | PhrasingContent;

export type PageConversion = {
  $import(node: MarkdownNode): LexicalNode[];
  $export(node: LexicalNode): MarkdownNode[];
  /** @deprecated Retained for custom page modules; new preview adapters use govbbmarkd/react component overrides. */
  render(node: MarkdownNode, key: string): ReactNode;
};

export type PageHandler = {
  accepts(node: MarkdownNode): boolean;
  owns(node: LexicalNode): boolean;
  $import(node: MarkdownNode, context: PageConversion): LexicalNode[];
  $export(node: LexicalNode, context: PageConversion): MarkdownNode[];
  /** @deprecated Omit for shared GovBB rendering; retained custom callbacks still receive their recursive context. */
  render?(node: MarkdownNode, context: PageConversion, key: string): ReactNode;
};

export type PageModule = EditorModule & { markdown?: readonly PageHandler[] };

export function definePageEditor(modules: readonly PageModule[]) {
  const definition = defineEditor(modules, "govbb-page");

  return Object.freeze({
    ...definition,
    pageHandlers: Object.freeze(modules.flatMap((module) => module.markdown ?? [])),
  });
}

export type PageEditorDefinition = ReturnType<typeof definePageEditor>;
