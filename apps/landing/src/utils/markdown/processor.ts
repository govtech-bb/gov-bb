import { compileContentMarkdown } from '@govtech-bb/govbbmarkd'
import type { CompiledContentMarkdown } from '@govtech-bb/govbbmarkd'

/** The landing adapter retains its async rejection contract and trusted legacy HTML policy. */
export async function processMarkdown(
  markdown: string,
): Promise<CompiledContentMarkdown> {
  const result = compileContentMarkdown(markdown, {
    html: 'legacy',
    frontmatter: false,
  })
  if (!result.ok) throw result.errors[0]
  return result.value
}
