import type {
  AnyLexicalExtensionArgument,
  EditorThemeClasses,
  Klass,
  LexicalEditor,
  LexicalNode,
  SerializedLexicalNode,
} from "lexical";
import type { EditorAction } from "./actions";
import type { EditorRenderer, EditorSlotContribution } from "./contributions";

export type DocumentNode = SerializedLexicalNode & {
  children?: DocumentNode[];
  [key: string]: unknown;
};

export type DocumentNodeDefinition = {
  readonly type: string;
  readonly node: Klass<LexicalNode>;
  /** Validate without rewriting or stripping unknown saved properties. */
  readonly validate?: (node: DocumentNode) => string | undefined;
};

export type EditorRegistration = {
  readonly key: string;
  readonly phase: "document" | "browser";
  readonly register: (editor: LexicalEditor) => () => void;
};

export type EditorModule = {
  readonly key: string;
  readonly nodes?: readonly DocumentNodeDefinition[];
  readonly registrations?: readonly EditorRegistration[];
  readonly actions?: readonly EditorAction[];
  readonly renderers?: readonly EditorRenderer[];
  readonly slots?: readonly EditorSlotContribution[];
  /** Browser behavior only. Saveable nodes and normalizers belong in shared declarations. */
  readonly browserExtensions?: readonly AnyLexicalExtensionArgument[];
  readonly theme?: EditorThemeClasses;
  readonly requires?: readonly string[];
  readonly provides?: readonly string[];
  readonly historyOwner?: string;
  /** One-shot document preparation, separate from live registrations. */
  readonly $normalizeInitial?: () => void;
  readonly $initialize?: () => void;
};
