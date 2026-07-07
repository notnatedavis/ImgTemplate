//   vite.config.js
//   build config

// ----- Imports -----
import { defineConfig } from 'vite';
import path from 'path';

// ----- Main -----
export default defineConfig({
  // base path for GitHub Pages
  base: '/ImgTemplate/',
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