import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkDirective from 'remark-directive'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import type { Root } from 'hast'
import componentDirectives from './plugins/componentDirectives'
import sanitizeUrls from './plugins/sanitizeUrls'
import tableScopes from './plugins/tableScopes'

type ProcessedMarkdown = {
  hast: Root
}

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
    .use(sanitizeUrls)
    .use(tableScopes)
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
  const hast = await processor.run(tree)
  return { hast }
}
