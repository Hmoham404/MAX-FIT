import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

import { cloudflare } from "@cloudflare/vite-plugin";

// BASE is "/MAX-FIT/" on GitHub Pages, "/" elsewhere (Cloudflare Pages, custom domain).
// Guard: Git Bash on Windows rewrites "/" into "C:/Program Files/Git/" — only accept real URL paths.
const rawBase = process.env.BASE_PATH || '/';
const base = /^\/[A-Za-z0-9_\-/]*$/.test(rawBase) ? (rawBase.endsWith('/') ? rawBase : rawBase + '/') : '/';

export default defineConfig({
  base,
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: { chunkSizeWarningLimit: 1500 },
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['favicon.png', 'icons/*.png', 'brand/*.png'],
    manifest: {
      name: 'MAX FIT — SMART GYM 360',
      short_name: 'MAX FIT',
      description: 'MAX FIT — salle de sport & back office SMART GYM 360 by GM LAC',
      theme_color: '#121212',
      background_color: '#121212',
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
  }), cloudflare()]
});