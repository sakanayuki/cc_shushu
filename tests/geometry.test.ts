import { describe, expect, it } from 'vitest';
import { circleArea, circleOverlapArea } from '../src/core/geometry';
import { createRng } from '../src/core/rng';

const O = (x: number, y: number) => ({ x, y });

describe('circleOverlapArea', () => {
  it('離れている円は0を返す', () => {
    expect(circleOverlapArea(O(0, 0), 10, O(100, 0), 10)).toBe(0);
  });

  it('ちょうど外接する円は0を返す', () => {
    expect(circleOverlapArea(O(0, 0), 10, O(20, 0), 10)).toBe(0);
  });

  it('中心が一致する同径の円は、その円の面積を返す', () => {
    expect(circleOverlapArea(O(0, 0), 10, O(0, 0), 10)).toBeCloseTo(circleArea(10), 6);
  });

  it('小さい円が大きい円に完全に内包される場合、小さい円の面積を返す', () => {
    expect(circleOverlapArea(O(0, 0), 50, O(5, 0), 10)).toBeCloseTo(circleArea(10), 6);
  });

  it('ちょうど内接する場合も内包として扱う', () => {
    expect(circleOverlapArea(O(0, 0), 50, O(40, 0), 10)).toBeCloseTo(circleArea(10), 6);
  });

  it('同径の円が半径分ずれたとき、既知のレンズ面積と一致する', () => {
    // r=1, d=1 のレンズ面積 = 2π/3 - √3/2
    expect(circleOverlapArea(O(0, 0), 1, O(1, 0), 1)).toBeCloseTo(
      (2 * Math.PI) / 3 - Math.sqrt(3) / 2,
      9,
    );
  });

  it('交換法則が成り立つ', () => {
    const a = circleOverlapArea(O(0, 0), 13, O(7, 3), 9);
    const b = circleOverlapArea(O(7, 3), 9, O(0, 0), 13);
    expect(a).toBeCloseTo(b, 9);
  });

  it('重なり面積は小さい方の円の面積を超えない', () => {
    const rng = createRng(7);
    for (let i = 0; i < 2000; i++) {
      const r1 = rng.range(1, 50);
      const r2 = rng.range(1, 50);
      const a = circleOverlapArea(
        O(rng.range(-100, 100), rng.range(-100, 100)),
        r1,
        O(rng.range(-100, 100), rng.range(-100, 100)),
        r2,
      );
      expect(a).toBeLessThanOrEqual(circleArea(Math.min(r1, r2)) + 1e-9);
    }
  });

  it('いかなる入力でもNaNを返さず非負である', () => {
    const rng = createRng(42);
    for (let i = 0; i < 10000; i++) {
      const a = circleOverlapArea(
        O(rng.range(-100, 100), rng.range(-100, 100)),
        rng.range(0.5, 50),
        O(rng.range(-100, 100), rng.range(-100, 100)),
        rng.range(0.5, 50),
      );
      expect(Number.isFinite(a)).toBe(true);
      expect(a).toBeGreaterThanOrEqual(0);
    }
  });

  it('外接ぎりぎりの距離でもNaNにならない（丸め誤差の保護）', () => {
    for (const eps of [1e-12, 1e-9, 1e-6]) {
      const a = circleOverlapArea(O(0, 0), 10, O(20 - eps, 0), 10);
      expect(Number.isFinite(a)).toBe(true);
      expect(a).toBeGreaterThanOrEqual(0);
    }
  });
});
