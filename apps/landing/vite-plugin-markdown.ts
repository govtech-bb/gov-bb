import matter from 'gray-matter'
import type { Plugin } from 'vite'
import { processMarkdown } from './src/utils/markdown'

// Compiles each *.md to a module at build, so the markdown parser stays out of
// the client bundle. registry.ts validates the raw frontmatter.
export function markdown(): Plugin {
  return {
    name: 'gov-bb:markdown',
    enforce: 'pre',
    async transform(code, id) {
      if (!id.endsWith('.md') || id.includes('/node_modules/')) return null
      const { data, content } = matter(code)
      const { hast, headings } = await processMarkdown(content)
      const json = (value: unknown) => JSON.stringify(value)
      return {
        code: [
          `export const frontmatter = ${json(data)}`,
          `export const body = ${json(content)}`,
          `export const hast = ${json(hast)}`,
          `export const headings = ${json(headings)}`,
        ].join('\n'),
        map: null,
      }
    },
  }
}
