import { expectTypeOf } from "vitest";
import {
  analyzeContentMarkdown,
  compileContentMarkdown,
  parseContentMarkdown,
  parsePageComponent,
  type MarkdownCompileOptions,
  type MarkdownCompileResult,
  type MarkdownDocument,
  type MarkdownParseOptions,
  type PageMarkdownError,
} from "@govtech-bb/govbbmarkd";

expectTypeOf(compileContentMarkdown).toEqualTypeOf<
  (source: string, options?: MarkdownCompileOptions) => MarkdownCompileResult
>();
expectTypeOf(analyzeContentMarkdown).toEqualTypeOf<
  (
    source: string,
    options?: MarkdownParseOptions,
  ) => MarkdownDocument & {
    readonly errors: readonly PageMarkdownError[];
  }
>();

const compiled = compileContentMarkdown("Hello", { frontmatter: false });
if (compiled.ok) expectTypeOf(compiled.value.text).toEqualTypeOf<string>();
else
  expectTypeOf(compiled.errors).toEqualTypeOf<readonly PageMarkdownError[]>();

analyzeContentMarkdown("Hello");
analyzeContentMarkdown("Hello", { frontmatter: false });
parseContentMarkdown("Hello", { frontmatter: true });
parsePageComponent({ type: "leafDirective", name: "action", children: [] });

// @ts-expect-error Source is text, not an arbitrary value.
parseContentMarkdown(42);
// @ts-expect-error Frontmatter selection is boolean.
parseContentMarkdown("Hello", { frontmatter: "false" });
// @ts-expect-error Ordinary paragraphs are not directives.
parsePageComponent({ type: "paragraph", children: [] });
// @ts-expect-error HTML sanitization is not a supported compilation policy.
compileContentMarkdown("Hello", { html: "sanitize" });
