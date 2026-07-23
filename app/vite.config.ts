import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Relative base: no GitHub Pages repo name is configured yet, so the build must not assume a
// fixed subpath (see docs/design.md and the Phase 2 plan's base-path decision).
export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: '.',
      filename: 'service-worker.ts',
      injectRegister: false,
      registerType: 'prompt',
      manifest: {
        name: 'BP Practice',
        short_name: 'BP Practice',
        description: 'Offline Brazilian Portuguese grammar practice',
        start_url: '.',
        scope: './',
        display: 'standalone',
        background_color: '#101418',
        theme_color: '#101418',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html}', 'icons/*.png', 'content-bundle.json'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    outDir: 'dist',
  },
});
