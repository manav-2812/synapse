import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Don't let the file watcher choke on transient tooling temp dirs
  // (e.g. Lighthouse profiles in .lh-tmp can hold OS file locks).
  server: {
    watch: {
      ignored: ['**/.lh-tmp/**', '**/node_modules/**'],
    },
  },
  build: {
    modulePreload: {
      resolveDependencies(_filename: string, deps: string[]) {
        return deps.filter((d) => !d.includes('pdf-vendor'))
      },
    },
    // Split the large, rarely-changing vendor (react / react-dom /
    // react-router) from app code so route-level chunks stay small
    // and cache well (Phase 4 / perf).
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (
              id.includes('react') ||
              id.includes('scheduler') ||
              id.includes('history') ||
              id.includes('react-router')
            ) {
              return 'react-vendor'
            }
            if (id.includes('jspdf') || id.includes('html2canvas')) {
              return 'pdf-vendor'
            }
            if (id.includes('highlight.js')) {
              return 'hljs-vendor'
            }
            if (id.includes('lucide-react')) {
              return 'icons-vendor'
            }
            return 'vendor'
          }
        },
      },
    },
  },
})
