import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import { comlink } from 'vite-plugin-comlink'
import topLevelAwait from 'vite-plugin-top-level-await'
import wasm from 'vite-plugin-wasm'

// Reads the replicad .d.ts at build time and exposes it as a virtual module.
// Needed because replicad's package.json `exports` field blocks deep imports.
function replicadTypesPlugin(): Plugin {
  const virtualId = 'virtual:replicad-types'
  const resolvedId = '\0' + virtualId
  return {
    name: 'replicad-types',
    resolveId(id) {
      if (id === virtualId) return resolvedId
    },
    load(id) {
      if (id !== resolvedId) return
      const content = fs.readFileSync(
        path.resolve(__dirname, 'node_modules/replicad/dist/replicad.d.ts'),
        'utf-8',
      )
      return `export default ${JSON.stringify(content)}`
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    replicadTypesPlugin(),
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    wasm(),
    comlink(),
    topLevelAwait(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      path: path.resolve(__dirname, './src/utils/path-mock.ts'),
    },
  },
  build: {
    target: 'es2022',
  },
})
