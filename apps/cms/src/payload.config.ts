import { postgresAdapter } from '@payloadcms/db-postgres'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import fs from 'fs'
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
import { migrations } from './migrations'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Origin of the landing site, allowed to read documents cross-origin for the
// Live Preview iframe.
const LANDING_ORIGIN = process.env.LANDING_URL || 'http://localhost:3000'

// Public origin of the admin itself, used for CSRF allowlisting so an attacker
// site can't post against it. In dev this is localhost; in prod set
// PAYLOAD_PUBLIC_URL (or PAYLOAD_PUBLIC_SERVER_URL, the alpha-infra task-def
// env var) to the deployed admin origin (e.g. https://cms-sandbox.alpha.gov.bb).
const ADMIN_ORIGIN =
  process.env.PAYLOAD_PUBLIC_SERVER_URL || process.env.PAYLOAD_PUBLIC_URL || 'http://localhost:8000'

const isProd = process.env.NODE_ENV === 'production'

// DATABASE_URL is preferred (and used by local docker-compose / .env.example).
// In the alpha-infra sandbox ECS deploy, the task definition injects individual
// DB_HOST / DB_USERNAME / DB_PASSWORD / DB_NAME / DB_PORT env vars (DB_HOST and
// credentials come from Secrets Manager; the rest are plain env). Assemble a
// connection string from those if DATABASE_URL isn't set.
function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const host = process.env.DB_HOST
  if (!host) return ''
  const user = encodeURIComponent(process.env.DB_USERNAME ?? '')
  const pass = encodeURIComponent(process.env.DB_PASSWORD ?? '')
  const port = process.env.DB_PORT ?? '5432'
  const name = process.env.DB_NAME ?? 'payload_cms'
  return `postgres://${user}:${pass}@${host}:${port}/${name}`
}

// Optional RDS CA bundle for TLS verification against RDS Postgres. The
// alpha-infra task definition sets DATABASE_SSL_CA_PATH; the gov-bb production
// Dockerfile downloads the RDS global CA bundle to that path during the build.
// In local dev (docker-compose) the env var is unset, the file isn't present,
// and pg connects without TLS — fine because the local DB doesn't require SSL.
function resolveSslConfig(): { ca: string; rejectUnauthorized: true } | undefined {
  const caPath = process.env.DATABASE_SSL_CA_PATH
  if (!caPath || !fs.existsSync(caPath)) return undefined
  return { ca: fs.readFileSync(caPath, 'utf8'), rejectUnauthorized: true }
}

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

// Media storage. ECS Fargate / App Runner have ephemeral disk, so local-disk
// uploads are wiped on every restart/redeploy. When S3_BUCKET is set the
// s3Storage plugin offloads Media to S3 instead. Credentials come from the
// task's IAM role by default; S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY override
// that for environments without an instance role. Unset locally → uploads stay
// on the local filesystem, which is fine for dev.
function mediaStoragePlugins() {
  const bucket = process.env.S3_BUCKET
  if (!bucket) return []
  const accessKeyId = process.env.S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY
  return [
    s3Storage({
      collections: { media: true },
      bucket,
      config: {
        region: process.env.S3_REGION || process.env.AWS_REGION,
        ...(accessKeyId && secretAccessKey
          ? { credentials: { accessKeyId, secretAccessKey } }
          : {}),
      },
    }),
  ]
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
  // Nothing consumes the CMS over GraphQL — the landing site reads the REST
  // API only. Disabling it stops schema generation and route registration,
  // removing the playground/introspection attack surface (Payload's
  // preventing-abuse guidance). The /api/graphql* route files are deleted too.
  graphQL: { disable: true },
  // Cap relationship-population depth a request may ask for (default 10). The
  // landing site never requests more than depth 2, so 5 leaves headroom while
  // blocking deep-population abuse on the public API.
  maxDepth: 5,
  editor: lexicalEditor({
    features: ({ defaultFeatures }) => withoutExcludedFeatures(defaultFeatures),
  }),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    // Scripts (migrate/fold/export) set PAYLOAD_NO_PUSH=1 to run against an
    // already-migrated database without drizzle's interactive dev schema-push
    // prompts. Left undefined for normal dev, where push keeps the schema in sync.
    push: process.env.PAYLOAD_NO_PUSH === '1' ? false : undefined,
    pool: {
      connectionString: resolveDatabaseUrl(),
      ssl: resolveSslConfig(),
    },
    // In production the slim runner image can't shell out to the Payload CLI,
    // so apply pending migrations from the bundled set on boot. In dev
    // (NODE_ENV !== 'production') this is ignored and the adapter push-syncs
    // the schema instead.
    prodMigrations: migrations,
  }),
  email: sesEmailAdapter(),
  sharp,
  plugins: [...mediaStoragePlugins()],
})
