/**
 * What a block rendered inside the editor needs that BlockNote does not
 * carry: the collection definitions its configuration form offers, the
 * records its live output renders, the ref keys it can point at, and any
 * validation errors against it.
 *
 * A context rather than props because BlockNote constructs block components
 * itself — there is no call site to thread anything through.
 */

import { createContext, useContext } from "react";
import type {
  CollectionDefinition,
  Ref,
  RenderContext,
  ValidationError,
} from "@govtech-bb/block-kit";

export interface EditorBlockContextValue {
  collections: CollectionDefinition[];
  data: RenderContext["data"];
  refs: Record<string, Ref>;
  refKeys: string[];
  /** True while a collection a block renders from is still being read. */
  loading: boolean;
  /** Errors for the whole document, keyed by block id when they have one. */
  errorsFor: (blockId: string) => ValidationError[];
}

const EMPTY: EditorBlockContextValue = {
  collections: [],
  data: {},
  refs: {},
  refKeys: [],
  loading: false,
  errorsFor: () => [],
};

const EditorBlockContext = createContext<EditorBlockContextValue>(EMPTY);

export const EditorBlockProvider = EditorBlockContext.Provider;

export function useEditorBlockContext(): EditorBlockContextValue {
  return useContext(EditorBlockContext);
}
