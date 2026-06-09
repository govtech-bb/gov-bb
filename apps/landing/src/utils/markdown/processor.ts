import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import type { Root } from 'hast'
import { collectHeadings, sanitizeUrls } from './plugins'
import type { MarkdownHeading } from './plugins'

export type ProcessedMarkdown = {
  /** Compiled body, rendered to React at runtime (see `MarkdownContent`). */
  hast: Root
  /** Section headings, for the "On this page" nav. */
  headings: Array<MarkdownHeading>
}

/**
 * Build-time markdown → {hast, headings}. Runs once per content file in the
 * markdown Vite plugin (see `vite-plugin-markdown.ts`), so the heavy parser
 * (remark + rehype-raw's HTML reparser) never reaches the client bundle; the
 * runtime only walks the precompiled hast.
 *
 * The chain mirrors tanstack.com's processor for the parts this site's content
 * actually uses: GFM, raw HTML, URL sanitization (`react-markdown@9` parity),
 * heading ids + autolink anchors, and a heading collection for the table of
 * contents. The two request-dependent passes (`hideStartLinks`, `sectionise`)
 * stay at runtime. Docs-only machinery (callouts, code highlighting, framework
 * tabs) is deliberately omitted — there is no content for it.
 *
 * A processor is built per call so `collectHeadings` can push into a fresh
 * array; construction is negligible next to the parse it drives.
 */
export async function processMarkdown(
  markdown: string,
): Promise<ProcessedMarkdown> {
  const headings: Array<MarkdownHeading> = []

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(sanitizeUrls)
    .use(rehypeSlug)
    .use(() => collectHeadings(headings))
    .use(rehypeAutolinkHeadings, {
      behavior: 'append',
      content: { type: 'text', value: '#' },
      properties: {
        ariaHidden: true,
        className: ['anchor-heading'],
        tabIndex: -1,
      },
    })

  const tree = processor.parse(markdown)
  const hast = (await processor.run(tree)) as unknown as Root
  return { hast, headings }
}
