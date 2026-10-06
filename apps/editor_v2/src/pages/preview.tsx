import { useMemo } from "react";
import type { PageEditorDefinition } from "./definition";
import { pageMarkdownToLexical } from "./converters";
import { pageMetadataFromYaml } from "./metadata";
import { pageConversion, parsePageMarkdown } from "./markdown";

export function PagePreview({
  source,
  definition,
}: {
  source: string;
  definition: PageEditorDefinition;
}) {
  const prepared = useMemo(() => {
    try {
      return pageMarkdownToLexical(source, definition);
    } catch (error) {
      return {
        mode: "source" as const,
        diagnostics: [{ message: error instanceof Error ? error.message : String(error) }],
      };
    }
  }, [source, definition]);

  if (prepared.mode === "source")
    return (
      <p role="status">
        Preview is unavailable for this source. {prepared.diagnostics[0]?.message}
      </p>
    );
  const root = parsePageMarkdown(source);
  const frontmatter = root.children[0];
  const metadata = pageMetadataFromYaml(frontmatter?.type === "yaml" ? frontmatter.value : "");
  const context = pageConversion(definition);

  return (
    <article className="page-body page-preview" aria-label="Page preview">
      <h1>{metadata.title || "Untitled page"}</h1>
      {metadata.lede && <p className="page-lede">{metadata.lede}</p>}
      {root.children
        .filter((node) => node.type !== "yaml")
        .map((node, index) => context.render(node, String(index)))}
    </article>
  );
}
