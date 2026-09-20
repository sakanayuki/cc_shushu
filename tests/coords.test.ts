import { describe, expect, it } from 'vitest';
import { computeLayout, logicalToScreen, screenToLogical } from '../src/core/coords';
import { params } from './helpers';

const P = params();
const SIZES: [number, number][] = [
  [375, 667],
  [393, 852],
  [412, 915],
  [820, 1180],
  [1024, 768],
];

describe('computeLayout', () => {
  it('論理→画面→論理の往復で元の値に戻る', () => {
    for (const [w, h] of SIZES) {
      const l = computeLayout(w, h, P.layout);
      for (const p of [
        { x: 0, y: 0 },
        { x: 500, y: 900 },
        { x: 1000, y: l.logicalHeight },
      ]) {
        const back = screenToLogical(logicalToScreen(p, l), l);
        expect(back.x).toBeCloseTo(p.x, 6);
        expect(back.y).toBeCloseTo(p.y, 6);
      }
    }
  });

  it('論理高さがクランプ範囲内に収まる', () => {
    for (const [w, h] of SIZES) {
      const l = computeLayout(w, h, P.layout);
      expect(l.logicalHeight).toBeGreaterThanOrEqual(P.layout.logicalHeightMin);
      expect(l.logicalHeight).toBeLessThanOrEqual(P.layout.logicalHeightMax);
    }
  });

  it('盤面がビューポート内に完全に収まる', () => {
    for (const [w, h] of SIZES) {
      const l = computeLayout(w, h, P.layout);
      const tl = logicalToScreen({ x: 0, y: 0 }, l);
      const br = logicalToScreen({ x: l.logicalWidth, y: l.logicalHeight }, l);
      expect(tl.x).toBeGreaterThanOrEqual(-1e-9);
      expect(tl.y).toBeGreaterThanOrEqual(-1e-9);
      expect(br.x).toBeLessThanOrEqual(w + 1e-9);
      expect(br.y).toBeLessThanOrEqual(h + 1e-9);
    }
  });

  it('レターボックスは上下または左右のどちらか一方のみに出る', () => {
    for (const [w, h] of SIZES) {
      const l = computeLayout(w, h, P.layout);
      expect(Math.min(l.offsetX, l.offsetY)).toBeLessThan(1e-6);
    }
  });

  it('領域の上下関係が常に成り立つ', () => {
    for (const [w, h] of SIZES) {
      const l = computeLayout(w, h, P.layout);
      expect(l.placedAreaTop).toBeLessThan(l.placedAreaBottom);
      expect(l.placedAreaBottom).toBeLessThan(l.launchZoneTop);
      expect(l.launchZoneTop).toBeLessThan(l.launchY);
      expect(l.launchY).toBeLessThan(l.logicalHeight);
    }
  });

  it('iPhone SE 相当ではレターボックスが出ない', () => {
    const l = computeLayout(375, 667, P.layout);
    expect(l.offsetX).toBeCloseTo(0, 6);
    expect(l.offsetY).toBeCloseTo(0, 6);
  });
});
