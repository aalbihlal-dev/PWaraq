import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';

export default defineConfig({
  plugins: [svelte()],
  define: { __WARAQ_VERSION__: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version) }, // shown in crash reports
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['harfbuzzjs'] }, // it finds harfbuzz.wasm next to itself
  server: { port: 5188, strictPort: true },
  build: { target: 'es2023' },
});
