// The single Lexical editor used for page bodies (Services + Organisations).
// Default features plus tables and the embeddable component blocks. The seed
// and export scripts derive the sanitized editor config from this via
// `getBodyEditorConfig` to convert markdown <-> Lexical.
import {
  lexicalEditor,
  EXPERIMENTAL_TableFeature as TableFeature,
  BlocksFeature,
  FixedToolbarFeature,
  editorConfigFactory,
  type SanitizedServerEditorConfig,
} from '@payloadcms/richtext-lexical'
import type { SanitizedConfig } from 'payload'
import { bodyBlocks } from '../fields/bodyBlocks'
import { withoutExcludedFeatures } from './editor-features'

export const bodyEditor = lexicalEditor({
  features: ({ defaultFeatures }) => [
    ...withoutExcludedFeatures(defaultFeatures),
    FixedToolbarFeature(),
    TableFeature(),
    BlocksFeature({ blocks: bodyBlocks }),
  ],
})

export const getBodyEditorConfig = (
  config: SanitizedConfig,
): Promise<SanitizedServerEditorConfig> =>
  editorConfigFactory.fromEditor({ editor: bodyEditor, config })
