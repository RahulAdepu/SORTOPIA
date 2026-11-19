import { defineConfig } from 'vitest/config';

// Playables requirement: the bundle MUST only use relative paths, so base is './'.
// File names produced by Rollup use only [A-Za-z0-9_-.] which satisfies the naming rule.
export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  preview: { port: 4173 },
  build: {
    outDir: 'dist',
    target: 'es2020',
    assetsInlineLimit: 0,
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: { phaser: ['phaser'] },
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 60000,
  },
});
