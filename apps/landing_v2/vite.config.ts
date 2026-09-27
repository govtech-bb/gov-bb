import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
  },
  plugins: [
    tailwindcss(),
    nitro({
      // Set the preset explicitly: Nitro otherwise reads
      // NITRO_PRESET/SERVER_PRESET from the ambient env
      // (node_modules/nitro/dist/_chunks/nitro.mjs:533), and form_builder's
      // shell may have one exported. landing_v2 always builds a local
      // node-server, never aws_amplify.
      preset: 'node-server',
    }),
    tanstackStart(),
    viteReact({ include: /\.(js|jsx|ts|tsx)$/ }),
  ],
})
