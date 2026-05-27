// Regenerates the landing app's markdown from the CMS. Run with: pnpm export:content
//
// Writes published Services and Organisations back to their .md files so the
// landing app's build-time glob keeps working. The CMS is the source of truth;
// the .md files are a generated artifact. Review the git diff before merging.

import 'dotenv/config'
import fs from 'fs/promises'
import path from 'path'
import matter from 'gray-matter'
import { getPayload, type Payload } from 'payload'
import config from '../payload.config.js'
import { CONTENT_DIR, ORGANISATIONS_DIR } from './content-paths.js'
import {
  serviceDocToFrontmatter,
  organisationDocToFrontmatter,
  type ServiceDoc,
  type OrganisationDoc,
} from '../lib/frontmatter-map.js'

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory()
  } catch {
    return false
  }
}

/**
 * A service whose slug is also a directory on disk (because it has sub-pages,
 * e.g. `get-death-certificate/start`) lives as `<slug>/index.md`. Writing a
 * flat `<slug>.md` next to it would make the landing registry resolve two files
 * to the same slug and silently keep the wrong one. Preserve the index.md form.
 */
async function servicePath(contentDir: string, slug: string): Promise<string> {
  const asDir = path.join(contentDir, slug)
  return (await isDirectory(asDir)) ? path.join(asDir, 'index.md') : `${asDir}.md`
}

async function writeMarkdown(
  file: string,
  data: Record<string, unknown>,
  body: string,
): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, matter.stringify(body ? `\n${body}\n` : '\n', data))
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

  let services = 0
  for await (const doc of allDocs(payload, 'services')) {
    const { data, body } = serviceDocToFrontmatter(doc as unknown as ServiceDoc & { slug: string })
    await writeMarkdown(await servicePath(CONTENT_DIR, (doc as { slug: string }).slug), data, body)
    services += 1
  }

  let orgs = 0
  for await (const doc of allDocs(payload, 'organisations')) {
    const { data, body } = organisationDocToFrontmatter(doc as unknown as OrganisationDoc)
    await writeMarkdown(
      path.join(ORGANISATIONS_DIR, `${(doc as { slug: string }).slug}.md`),
      data,
      body,
    )
    orgs += 1
  }

  console.log(`Exported ${services} services and ${orgs} organisations to ${CONTENT_DIR}`)
  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
