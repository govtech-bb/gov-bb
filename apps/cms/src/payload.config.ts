import { postgresAdapter } from '@payloadcms/db-postgres'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
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
// Live Preview iframe.
const LANDING_ORIGIN = process.env.LANDING_URL || 'http://localhost:3000'

// Public origin of the admin itself, used for CSRF allowlisting so an attacker
// site can't post against it. In dev this is localhost; in prod set
// PAYLOAD_PUBLIC_URL to the deployed admin origin (e.g. https://cms.gov.bb).
const ADMIN_ORIGIN = process.env.PAYLOAD_PUBLIC_URL || 'http://localhost:8000'

const isProd = process.env.NODE_ENV === 'production'

// SES SMTP credentials. Generate these in the SES console (SMTP Settings →
// Create SMTP credentials) — they are NOT the same as IAM access keys.
// Unset locally → no email adapter is registered and Payload logs emails
// to the console, which is what we want in dev.
function sesEmailAdapter() {
  const host = process.env.SES_SMTP_HOST
  if (!host) return undefined
  return nodemailerAdapter({
    defaultFromAddress: process.env.SES_FROM_EMAIL ?? 'no-reply@alpha.gov.bb',
    defaultFromName: process.env.SES_FROM_NAME ?? 'gov.bb CMS',
    transportOptions: {
      host,
      port: Number(process.env.SES_SMTP_PORT ?? 587),
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.SES_SMTP_USER ?? '',
        pass: process.env.SES_SMTP_PASS ?? '',
      },
    },
  })
}

export default buildConfig({
  cors: [LANDING_ORIGIN, ADMIN_ORIGIN],
  csrf: [ADMIN_ORIGIN, LANDING_ORIGIN],
  cookiePrefix: 'gov-bb-cms',
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
  email: sesEmailAdapter(),
  sharp,
  plugins: [],
})
