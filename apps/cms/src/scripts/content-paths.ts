import path from 'path'
import { fileURLToPath } from 'url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

/** Landing app content directory — the markdown source of truth today. */
export const CONTENT_DIR =
  process.env.CONTENT_DIR ?? path.resolve(dirname, '../../../landing/src/content')

export const ORGANISATIONS_DIR = path.join(CONTENT_DIR, 'government/organisations')
