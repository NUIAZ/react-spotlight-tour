/**
 * Library build + test config.
 *
 *   npm run build   →  vite build --mode lib
 *   npm test        →  vitest run   (uses the `test` block below)
 *
 * `defineConfig` comes from `vitest/config` rather than `vite` so the `test`
 * key is typed instead of being an untyped escape hatch.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

/**
 * Copies the stylesheet into `dist/` verbatim.
 *
 * The alternative — importing the CSS from `src/index.ts` so Vite bundles it —
 * would force the stylesheet on every consumer and, worse, put a CSS import in
 * the CommonJS entry, which plain `require()` cannot handle. The file has no
 * `@import`s and no asset URLs, so a byte-for-byte copy is not a shortcut; it
 * is the correct build step.
 */
function copyStylesheet(): Plugin {
  return {
    name: 'rst-copy-stylesheet',
    apply: 'build',
    closeBundle() {
      mkdirSync(resolve(root, 'dist'), { recursive: true });
      copyFileSync(
        resolve(root, 'src/spotlight-tour.css'),
        resolve(root, 'dist/spotlight-tour.css'),
      );
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // Declarations are only wanted for the published artifact; generating them
    // during a test run would slow every watch cycle down for nothing.
    ...(mode === 'lib'
      ? [
          dts({
            include: ['src'],
            exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/__tests__/**'],
            outDir: resolve(root, 'dist'),
            rollupTypes: false,
            tsconfigPath: resolve(root, 'tsconfig.json'),
            // The shared tsconfig sets `noEmit` so that `npm run typecheck` is a
            // pure check; the plugin has to be told to emit anyway.
            compilerOptions: { noEmit: false, declaration: true, emitDeclarationOnly: true },
          }),
          copyStylesheet(),
        ]
      : []),
  ],

  build: {
    lib: {
      entry: resolve(root, 'src/index.ts'),
      name: 'ReactSpotlightTour',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    // React is the consumer's, not ours. `react/jsx-runtime` has to be listed
    // explicitly: the automatic JSX transform imports it, and bundling a second
    // copy of it is one of the classic ways to end up with two Reacts.
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
    sourcemap: true,
    // Off so a consumer's own build can decide; publishing pre-minified code
    // only makes stack traces worse for the people debugging against it.
    minify: false,
    emptyOutDir: true,
  },

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [resolve(root, 'src/__tests__/setup.ts')],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    css: false,
    restoreMocks: true,
  },
}));
