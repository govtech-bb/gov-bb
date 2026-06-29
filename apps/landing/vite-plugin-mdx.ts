import mdx from '@mdx-js/rollup'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'

// Shared MDX plugin for vite.config.ts (build) and vitest.config.ts (tests) so
// `.mdx` content pages compile identically in both. enforce:'pre' so MDX runs
// before other transforms.
export function mdxPlugin() {
  return {
    enforce: 'pre' as const,
    ...mdx({
      jsxImportSource: 'react',
      // CRITICAL: @mdx-js handles BOTH .md and .mdx by default. Leave `.md` to
      // the custom markdown() hast pipeline — disable it here, or `.md` pages
      // lose their gray-matter frontmatter (empty categories / wrong URLs).
      mdExtensions: [],
      remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter],
    }),
  }
}
