import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/ws': { target: 'ws://localhost:3001', ws: true },
      '/sprites': 'http://localhost:3001',
      '/objects': 'http://localhost:3001',
      '/api': 'http://localhost:3001',
    },
  },
});
