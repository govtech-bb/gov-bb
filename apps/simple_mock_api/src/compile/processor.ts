import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import type { Root } from "hast";
import componentDirectives from "./plugins/componentDirectives.js";
import sanitizeUrls from "./plugins/sanitizeUrls.js";
import tableScopes from "./plugins/tableScopes.js";
import { schema } from "./sanitize-schema.js";

type ProcessedMarkdown = {
  hast: Root;
};

export async function processMarkdown(
  markdown: string,
): Promise<ProcessedMarkdown> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .use(componentDirectives)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize, schema)
    .use(sanitizeUrls)
    .use(tableScopes)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      behavior: "append",
      content: { type: "text", value: "#" },
      properties: {
        ariaHidden: true,
        className: ["anchor-heading"],
        tabIndex: -1,
      },
    });

  const tree = processor.parse(markdown);
  // rehype-sanitize's snapshot is typed against @types/hast 3.0.5 on this
  // base (it is shared with @tanstack/ai-react), while this app, the contract
  // and landing's renderer use the workspace's 3.0.4. The two Root types
  // differ only in property-value narrowing, so widen at this one boundary
  // rather than re-typing a shared snapshot.
  const hast = (await processor.run(tree)) as Root;
  return { hast };
}
