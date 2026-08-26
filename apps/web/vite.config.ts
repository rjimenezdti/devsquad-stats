import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        // AdminKit + Bootstrap resolve partials from node_modules; let dart-sass
        // find them and silence the legacy @import deprecation noise they emit.
        loadPaths: ['node_modules'],
        quietDeps: true,
        silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'mixed-decls'],
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy vendors so the main bundle stays lean.
        manualChunks: {
          charts: ['apexcharts', 'react-apexcharts'],
          vendor: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query', 'axios'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Forward API calls to the backend proxy during development.
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
