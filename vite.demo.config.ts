/**
 * Demo-site build config, separate from the library build so neither one has to
 * carry `if (mode === …)` branches for the other.
 *
 *   npm run dev         →  local demo server
 *   npm run build:demo  →  static site in dist-demo/
 *
 * `base: './'` is load-bearing for GitHub Pages: the site is served from
 * `/<repo>/`, not from the domain root, and absolute `/assets/...` URLs would
 * 404 there. Relative URLs work under any prefix, including a local
 * `file://` open of the built output.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: resolve(root, 'demo'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      // The demo imports the library the way a consumer would, but resolves to
      // source rather than dist — so `npm run dev` hot-reloads library changes
      // and the demo can never be built against a stale dist/.
      'react-spotlight-tour/styles.css': resolve(root, 'src/spotlight-tour.css'),
      'react-spotlight-tour': resolve(root, 'src/index.ts'),
    },
  },
  build: {
    outDir: resolve(root, 'dist-demo'),
    emptyOutDir: true,
    sourcemap: false,
  },
});
