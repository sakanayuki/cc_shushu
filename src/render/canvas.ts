export interface CanvasSurface {
  readonly ctx: CanvasRenderingContext2D;
  /** CSS px でのビューポートサイズ */
  width: number;
  height: number;
  /** リサイズを反映する。サイズが変わったら true */
  resize(): boolean;
}

export function createCanvasSurface(
  canvas: HTMLCanvasElement,
  maxDpr: number,
): CanvasSurface {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('2D context is not available');

  const surface: CanvasSurface = {
    ctx,
    width: 0,
    height: 0,
    resize(): boolean {
      // DPR は上限を設ける。DPR 3 の端末ではバッキングストアが9倍の面積になり、
      // 低スペック機で描画が破綻するため。
      const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return false;

      const bw = Math.round(w * dpr);
      const bh = Math.round(h * dpr);
      const changed = surface.width !== w || surface.height !== h || canvas.width !== bw;
      if (!changed) return false;

      canvas.width = bw;
      canvas.height = bh;
      // 以降の描画コードは DPR を意識しなくてよい
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      surface.width = w;
      surface.height = h;
      return true;
    },
  };

  surface.resize();
  return surface;
}
