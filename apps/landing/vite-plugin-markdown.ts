import matter from 'gray-matter'
import type { Plugin } from 'vite'
import { processMarkdown } from './src/utils/markdown'

/**
 * Compiles each imported `*.md` file to a module at build time, so the registry
 * can `import.meta.glob` content with the markdown already parsed — the heavy
 * parser never reaches the client bundle (see `src/utils/markdown/processor`).
 *
 * Frontmatter is split off with gray-matter and passed through raw; `registry.ts`
 * validates it against `FrontmatterSchema`. The exported `body` (raw markdown) is
 * kept for the search index; `hast` + `headings` are what the page renders.
 *
 * This is the in-repo content path. When content is later pulled from other org
 * repos, those files are staged locally and matched by the same glob — no second
 * pipeline.
 */
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
