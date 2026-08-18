import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
        '@brand': resolve('build')
      }
    },
    plugins: [react()],
    server: {
      fs: {
        allow: [resolve('.'), resolve('build')]
      }
    },
    optimizeDeps: {
      include: ['monaco-editor', '@monaco-editor/react', 'pdfjs-dist']
    },
    worker: {
      format: 'es'
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          'pdf-print': resolve('src/renderer/pdf-print.html')
        }
      }
    }
  }
})
