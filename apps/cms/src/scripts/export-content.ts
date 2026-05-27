// Regenerates the landing app's content JSON from the CMS. Run with: pnpm export:content
//
// Writes published Services and Organisations to .json files that the landing
// app globs at build time. Each file is { ...frontmatter fields, body, bodyText }
// where `body` is the Lexical editor state (rendered on the site) and `bodyText`
// is its markdown rendering (used by search and the chat RAG ingest). The CMS is
// the source of truth; review the git diff before merging.

import 'dotenv/config'
import fs from 'fs/promises'
import path from 'path'
import { getPayload, type Payload } from 'payload'
import { convertLexicalToMarkdown } from '@payloadcms/richtext-lexical'
import config from '../payload.config.js'
import { CONTENT_DIR, ORGANISATIONS_DIR } from './content-paths.js'
import { getBodyEditorConfig } from '../lib/body-editor.js'
import {
  serviceDocToFrontmatter,
  organisationDocToFrontmatter,
  type ServiceDoc,
  type OrganisationDoc,
} from '@govtech-bb/content/map'

// convertLexicalToMarkdown throws on a root with no children. Empty bodies are
// valid (a page can be all structured fields), so render them as empty text.
function toBodyText(
  body: import('lexical').SerializedEditorState,
  editorConfig: Parameters<typeof convertLexicalToMarkdown>[0]['editorConfig'],
): string {
  if (!body?.root?.children?.length) return ''
  return convertLexicalToMarkdown({ data: body, editorConfig })
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory()
  } catch {
    return false
  }
}

/**
 * A service whose slug is also a directory on disk (because it has sub-pages,
 * e.g. `get-death-certificate/start`) lives as `<slug>/index.json`. Writing a
 * flat `<slug>.json` next to it would make the landing registry resolve two
 * files to the same slug. Preserve the index form.
 */
async function servicePath(contentDir: string, slug: string): Promise<string> {
  const asDir = path.join(contentDir, slug)
  return (await isDirectory(asDir)) ? path.join(asDir, 'index.json') : `${asDir}.json`
}

async function writeJson(file: string, obj: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, `${JSON.stringify(obj, null, 2)}\n`)
}

async function* allDocs(payload: Payload, collection: 'services' | 'organisations') {
  let page = 1
  for (;;) {
    const res = await payload.find({
      collection,
      depth: 2,
      limit: 100,
      page,
      where: { _status: { equals: 'published' } },
    })
    yield* res.docs
    if (!res.hasNextPage) break
    page += 1
  }
}

async function run(): Promise<void> {
  const payload = await getPayload({ config })
  const editorConfig = await getBodyEditorConfig(payload.config)

  let services = 0
  for await (const doc of allDocs(payload, 'services')) {
    const { data, body } = serviceDocToFrontmatter(doc as unknown as ServiceDoc & { slug: string })
    const bodyText = toBodyText(body, editorConfig)
    await writeJson(await servicePath(CONTENT_DIR, (doc as { slug: string }).slug), {
      ...data,
      body,
      bodyText,
    })
    services += 1
  }

  let orgs = 0
  for await (const doc of allDocs(payload, 'organisations')) {
    const { data, body } = organisationDocToFrontmatter(doc as unknown as OrganisationDoc)
    const bodyText = toBodyText(body, editorConfig)
    await writeJson(path.join(ORGANISATIONS_DIR, `${(doc as { slug: string }).slug}.json`), {
      ...data,
      body,
      bodyText,
    })
    orgs += 1
  }

  console.log(`Exported ${services} services and ${orgs} organisations to ${CONTENT_DIR}`)
  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
