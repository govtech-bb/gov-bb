import { cp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = resolve(root, '../../dist/editor-site-preview')

await rm(output, { recursive: true, force: true })
await build({
  root,
  configFile: resolve(root, 'vite.cms-preview.config.ts'),
  build: { outDir: resolve(output, 'cms-preview') },
})
await cp(resolve(root, 'public/images'), resolve(output, 'images'), {
  recursive: true,
})
