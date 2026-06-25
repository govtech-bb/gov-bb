import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import type { Root } from 'hast'
import { sanitizeUrls } from './plugins'

type ProcessedMarkdown = {
  hast: Root
}

export async function processMarkdown(
  markdown: string,
): Promise<ProcessedMarkdown> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(sanitizeUrls)
    .use(rehypeSlug)
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
  return { hast }
}
