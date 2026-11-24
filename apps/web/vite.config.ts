import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// BASE is "/MAX-FIT/" on GitHub Pages, "/" elsewhere (Cloudflare Pages, custom domain).
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: { chunkSizeWarningLimit: 1500 },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'MAX FIT — SMART GYM 360',
        short_name: 'MAX FIT',
        description: 'MAX FIT — salle de sport & back office SMART GYM 360 by GM LAC',
        theme_color: '#0B0D10',
        background_color: '#0B0D10',
        display: 'standalone',
        start_url: base + 'admin',
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Only the static app shell is cached. API responses (sensitive data) are NEVER cached.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,ttf}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: base + 'index.html',
        runtimeCaching: []
      }
    })
  ]
});