export type SupportedLanguage =
  | "javascript"
  | "typescript"
  | "jsx"
  | "tsx"
  | "json"
  | "jsonc"
  | "html"
  | "css"
  | "python"
  | "yaml"
  | "markdown"
  | "graphql"
  | "sql"
  | "bash"
  | "shell"
  | "diff"
  | "hcl"
  | "toml";
export const LANGUAGE_ALIASES = {
  js: "javascript",
  cjs: "javascript",
  mjs: "javascript",
  ts: "typescript",
  cts: "typescript",
  mts: "typescript",
  sh: "bash",
  zsh: "bash",
  yml: "yaml",
  py: "python",
  md: "markdown",
  gql: "graphql",
} as const satisfies Record<string, SupportedLanguage>;
/** A known alias that maps to a SupportedLanguage. */
export type LanguageAlias = keyof typeof LANGUAGE_ALIASES;
/** Any language identifier accepted by ShikiProvider and highlight(). */
export type LanguageInput = SupportedLanguage | LanguageAlias;
/**
 * Shiki engine choice for syntax highlighting.
 * - `"javascript"` — Smaller bundle (~50KB), slightly less accurate
 * - `"wasm"` — Larger bundle (~180KB), VS Code-accurate highlighting
 */
export type ShikiEngine = "javascript" | "wasm";
/**
 * Localized labels for the copy button.
 */
export interface CodeHighlightedLabels {
  /** Label for copy button (default: "Copy") */
  copy?: string;
  /** Label shown after copying (default: "Copied!") */
  copied?: string;
}
/**
 * Props for ShikiProvider component.
 */
export interface ShikiProviderProps {
  /**
   * Highlighting engine choice.
   * - `"javascript"` — Smaller, faster to load (~50KB gzipped)
   * - `"wasm"` — Larger but more accurate (~180KB gzipped)
   */
  engine: ShikiEngine;
  languages: LanguageInput[];
  labels?: CodeHighlightedLabels;
  /** React children */
  children: React.ReactNode;
}
/**
 * Return value from useShikiHighlighter hook.
 */
export interface UseShikiHighlighterResult {
  highlight: (
    code: string,
    lang: LanguageInput | (string & {}),
  ) => string | null;
  /** True while Shiki is loading */
  isLoading: boolean;
  /** True when highlight() is safe to call */
  isReady: boolean;
  /** Error if Shiki initialization failed */
  error: Error | null;
  /** Localized labels from provider */
  labels: CodeHighlightedLabels;
}
/**
 * Props for CodeHighlighted component.
 */
export interface CodeHighlightedProps {
  /** Source code to display */
  code: string;
  /**
   * Language identifier for syntax highlighting.
   * Accepts canonical names or common aliases (e.g., 'js', 'ts').
   * Must be included in the ShikiProvider's `languages` array.
   */
  lang: LanguageInput | (string & {});
  /** Display line numbers */
  showLineNumbers?: boolean;
  highlightLines?: number[];
  /** Show copy-to-clipboard button */
  showCopyButton?: boolean;
  labels?: CodeHighlightedLabels;
  /** Additional CSS classes */
  className?: string;
}
// Re-export for backwards compatibility (deprecated, use SupportedLanguage instead)
export type BundledLanguage = SupportedLanguage;
