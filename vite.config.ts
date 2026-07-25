import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// GitHub Pages serves the build from /<repo>/ ; local dev and previews use /.
const base = process.env.GITHUB_ACTIONS ? '/XIV/' : '/';

export default defineConfig({
  base,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Three is the bulk of the bundle and never changes between releases —
        // splitting it keeps the game code cacheable on its own.
        manualChunks: (id: string) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
