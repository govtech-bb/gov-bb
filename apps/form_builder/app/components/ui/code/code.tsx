import { type CSSProperties } from "react";
import { cn } from "../utils/cn";
/** Code language variant definitions. */
const codeStyles = {
  lang: {
    ts: "",
    tsx: "",
    jsonc: "",
    bash: "",
    css: "",
  },
} as const;
export type CodeLang = keyof typeof codeStyles.lang;
export interface CodeVariantsProps {
  lang?: CodeLang;
}
export function codeVariants({ lang = "ts" }: CodeVariantsProps = {}) {
  return cn(
    // Base styles
    "m-0 w-auto ui-scroll-native overflow-x-auto rounded-none border-none bg-transparent p-0 font-mono text-sm leading-[20px] text-ui-subtle",
    codeStyles.lang[lang] ?? codeStyles.lang["ts"],
  );
}
export type BundledLanguage = CodeLang;
export interface CodeProps extends CodeVariantsProps {
  /** The code string to display. */
  code: string;
  /** Template values for `{{key}}` interpolation. Values with `highlight: true` are visually emphasized. */
  values?: Record<
    string,
    {
      value: string;
      highlight?: boolean;
    }
  >;
  /** Additional CSS classes merged via `cn()`. */
  className?: string;
  /** Inline styles. */
  style?: CSSProperties;
}
function CodeComponent({ code, lang = "ts", className, style }: CodeProps) {
  return (
    <pre className={cn(codeVariants({ lang }), className)} style={style}>
      {code}
    </pre>
  );
}
CodeComponent.displayName = "Code";
export interface CodeBlockProps {
  /** The code string to display. */
  code: string;
  /**
   * Language hint for the code content.
   * @default "ts"
   */
  lang?: CodeLang;
}
function CodeBlockComponent({ code, lang }: CodeBlockProps) {
  return (
    <div className="min-w-0 rounded-md border border-ui-tint bg-ui-base [&>pre]:p-2.5!">
      <CodeComponent lang={lang} code={code} />
    </div>
  );
}
CodeBlockComponent.displayName = "CodeBlock";
// Export Code with Block sub-component (for registry detection)
export const Code = Object.assign(CodeComponent, {
  Block: CodeBlockComponent,
});
export const CodeBlock = CodeBlockComponent;
