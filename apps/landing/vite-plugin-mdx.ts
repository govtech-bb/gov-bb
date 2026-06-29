import mdx from '@mdx-js/rollup'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import { sanitizeUrls } from './src/utils/markdown/plugins'

// Shared MDX plugin for vite.config.ts (build) and vitest.config.ts (tests) so
// `.mdx` content pages compile identically in both. enforce:'pre' so MDX runs
// before other transforms. The remark/rehype chain mirrors the legacy markdown
// processor (processor.ts) so prose renders identically once .md → .mdx.
export function mdxPlugin() {
  return {
    enforce: 'pre' as const,
    ...mdx({
      jsxImportSource: 'react',
      // CRITICAL: @mdx-js handles BOTH .md and .mdx by default. Leave `.md` to
      // the custom markdown() hast pipeline — disable it here, or `.md` pages
      // lose their gray-matter frontmatter (empty categories / wrong URLs).
      mdExtensions: [],
      remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter, remarkGfm],
      rehypePlugins: [
        sanitizeUrls,
        rehypeSlug,
        [
          rehypeAutolinkHeadings,
          {
            behavior: 'append',
            content: { type: 'text', value: '#' },
            properties: {
              ariaHidden: true,
              className: ['anchor-heading'],
              tabIndex: -1,
            },
          },
        ],
      ],
    }),
  }
}
