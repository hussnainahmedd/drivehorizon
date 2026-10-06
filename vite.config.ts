import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      output: { manualChunks: { three: ['three'] } },
    },
    chunkSizeWarningLimit: 650,
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
