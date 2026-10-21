// Vite serves the HarfBuzz subsetter's wasm as a file; the worker fetches it by this URL.
declare module 'harfbuzzjs/dist/harfbuzz-subset.wasm?url' { const url: string; export default url; }
