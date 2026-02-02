import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { readFileSync } from 'fs';

// Read version from package.json
const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  publicDir: 'fonts',
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
