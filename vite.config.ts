import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { VitePWA } from 'vite-plugin-pwa'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/pdfjs-dist/build/pdf.worker.mjs',
          dest: ''
        },
        {
          src: 'node_modules/pdfjs-dist/wasm',
          dest: ''
        }
      ]
    }),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: true },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,mjs,wasm,mp3,webp,avif,jpeg,jpg}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 // 5 MB to allow pdf.worker.mjs
      },
      manifest: {
        name: 'OHARA Reader',
        short_name: 'OHARA',
        description: 'Offline first reading experience',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'https://cdn-icons-png.flaticon.com/512/2232/2232688.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
})
