import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['harfbuzzjs'] }, // it finds harfbuzz.wasm next to itself
  server: { port: 5188, strictPort: true },
  build: { target: 'es2023' },
});
