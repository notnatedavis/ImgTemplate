//   vite.config.js
//   build config

// ----- Imports -----
import { defineConfig } from 'vite';
import path from 'path';

// ----- Main -----
export default defineConfig({
  // Base path for GitHub Pages (repository name is 'imgTemplate')
  base: '/imgTemplate/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true
  }
});