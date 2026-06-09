// Build-time markdown pipeline. `processMarkdown` pulls in the parser, so it is
// imported only from the build (see `vite-plugin-markdown.ts`); runtime code
// imports the lightweight `./plugins` and `components/markdown` barrels instead.
export { processMarkdown } from './processor'
export type { ProcessedMarkdown } from './processor'
export type { MarkdownHeading } from './plugins'
