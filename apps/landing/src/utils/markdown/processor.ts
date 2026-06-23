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
  hast: Root
  headings: Array<MarkdownHeading>
}

export async function processMarkdown(
  markdown: string,
): Promise<ProcessedMarkdown> {
  // Built per call so collectHeadings pushes into a fresh array.
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
