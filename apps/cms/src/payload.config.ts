import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Categories, Subcategories } from './collections/Categories'
import { Services } from './collections/Services'
import { Organisations } from './collections/Organisations'
import { withoutExcludedFeatures } from './lib/editor-features'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Origin of the landing site, allowed to read documents cross-origin for the
// Live Preview iframe. Note: do NOT add this to `csrf` — csrf is a whitelist
// that, once set, would lock the admin's own origin out of authenticated
// requests (autosave, etc.). Live Preview only needs a public cross-origin read.
const LANDING_ORIGIN = process.env.LANDING_URL || 'http://localhost:3000'

export default buildConfig({
  cors: [LANDING_ORIGIN],
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: '— gov.bb CMS',
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
    livePreview: {
      collections: ['services', 'organisations'],
      url: ({ data, collectionConfig }) => {
        const base = process.env.LANDING_URL || 'http://localhost:3000'
        const slug = typeof data?.slug === 'string' ? data.slug : ''
        const id = data?.id != null ? String(data.id) : ''
        return `${base}/preview?collection=${collectionConfig?.slug}&slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(id)}`
      },
      breakpoints: [
        { name: 'mobile', label: 'Mobile', width: 375, height: 667 },
        { name: 'desktop', label: 'Desktop', width: 1440, height: 900 },
      ],
    },
  },
  collections: [Services, Organisations, Categories, Subcategories, Media, Users],
  editor: lexicalEditor({
    features: ({ defaultFeatures }) => withoutExcludedFeatures(defaultFeatures),
  }),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
  }),
  sharp,
  plugins: [],
})
