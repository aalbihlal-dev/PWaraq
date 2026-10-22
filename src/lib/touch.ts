// Two-finger pinch on an element. Touch events (not pointer events) so the browser's own page zoom and two-finger scroll can be cancelled.
// `change(ratio, x, y)`: ratio of the current finger distance to the distance when the second finger came down; x, y: the middle between the fingers.
export function pinch(node: HTMLElement, o: { start?: () => void; change: (ratio: number, x: number, y: number) => void; end?: () => void }) {
  let d0 = 0;
  const two = (e: TouchEvent) => { const [a, b] = [e.touches[0], e.touches[1]]; return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }; };
  const down = (e: TouchEvent) => { if (e.touches.length === 2) { d0 = two(e).d || 1; o.start?.(); } };
  const move = (e: TouchEvent) => { if (e.touches.length === 2 && d0) { e.preventDefault(); const p = two(e); o.change(p.d / d0, p.x, p.y); } };
  const up = (e: TouchEvent) => { if (e.touches.length < 2 && d0) { d0 = 0; o.end?.(); } };
  const block = (e: Event) => e.preventDefault(); // Safari's own pinch-zoom of the page
  node.addEventListener('touchstart', down, { passive: true });
  node.addEventListener('touchmove', move, { passive: false });
  node.addEventListener('touchend', up); node.addEventListener('touchcancel', up);
  for (const g of ['gesturestart', 'gesturechange', 'gestureend']) node.addEventListener(g, block);
  return { destroy() {
    node.removeEventListener('touchstart', down); node.removeEventListener('touchmove', move); node.removeEventListener('touchend', up); node.removeEventListener('touchcancel', up);
    for (const g of ['gesturestart', 'gesturechange', 'gestureend']) node.removeEventListener(g, block);
  } };
}
