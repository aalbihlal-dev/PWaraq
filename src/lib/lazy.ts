// A page's picture drawn into its canvas when it scrolls into view (Redact, Forms, OCR show every page of the document).
import type { EnginePool } from './engine/pool';

export const lazyPage = (pool: () => EnginePool, key: string, scale: (page: number) => number, doc?: () => number) => (node: HTMLCanvasElement, i: number) => {
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    pool().run<ImageBitmap>({ op: 'render', page: i, priority: 1, key: key + i, args: { doc: doc?.(), scale: scale(i) * Math.min(devicePixelRatio || 1, 2) } })
      .then((bmp) => { node.width = bmp.width; node.height = bmp.height; node.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close(); }).catch(() => {});
  }, { rootMargin: '400px' });
  io.observe(node);
  return { destroy: () => io.disconnect() };
};
