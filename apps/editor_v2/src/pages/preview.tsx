import { useMemo, type ReactNode } from "react";
import govbbStyles from "@govtech-bb/frontend/css?inline";
import { compileContentMarkdown } from "@govtech-bb/govbbmarkd";
import { renderMarkdownNodes } from "@govtech-bb/govbbmarkd/react";
import type { PageEditorDefinition } from "./definition";
import { pageMarkdownToLexical } from "./converters";
import { pageMetadataFromYaml } from "./metadata";
import { parsePageMarkdown, renderLegacyPagePreview } from "./markdown";

/** Local preview uses scoped styles; the live site preview resolves form destinations. */
export function PagePreview({
  source,
  definition,
}: {
  source: string;
  definition: PageEditorDefinition;
}): ReactNode {
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
  // The editor has already checked every HTML node against its visual-editing allowlist.
  const compiled = compileContentMarkdown(source, { html: "legacy" });

  if (!compiled.ok) throw compiled.errors[0];

  return (
    <article className="page-preview govbb-prose" aria-label="Page preview">
      <style>{`@scope (.page-preview) { ${govbbStyles} }`}</style>
      <h1>{metadata.title || "Untitled page"}</h1>
      {metadata.lede && <p className="page-lede">{metadata.lede}</p>}
      {definition.pageHandlers.some((handler) => handler.render)
        ? renderLegacyPagePreview(
            root.children.filter((node) => node.type !== "yaml"),
            definition,
          )
        : renderMarkdownNodes(compiled.value.hast.children)}
    </article>
  );
}
