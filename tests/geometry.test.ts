import { describe, expect, it } from 'vitest';
import {
  circleArea,
  circleOverlapArea,
  coverageRatio,
  distance as distanceBetween,
} from '../src/core/geometry';
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

describe('coverageRatio — 和集合としての被覆率', () => {
  const S = 20000;

  it('重なる投げカードがなければ0を返す', () => {
    expect(
      coverageRatio({ pos: O(0, 0), radius: 50 }, [{ pos: O(500, 0), radius: 92 }], S),
    ).toBe(0);
  });

  it('1枚で完全に覆われていれば1を返す', () => {
    expect(
      coverageRatio({ pos: O(0, 0), radius: 40 }, [{ pos: O(0, 0), radius: 92 }], S),
    ).toBeCloseTo(1, 6);
  });

  it('1枚の場合は解析解と厳密に一致する（サンプリングを使わない）', () => {
    const placed = { pos: O(0, 0), radius: 100 };
    const t = { pos: O(70, 0), radius: 92 };
    const exact =
      circleOverlapArea(placed.pos, placed.radius, t.pos, t.radius) / circleArea(placed.radius);
    expect(coverageRatio(placed, [t], S)).toBeCloseTo(exact, 12);
  });

  it('投げカード同士が重ならない場合、和集合は単純加算と一致する', () => {
    const placed = { pos: O(0, 0), radius: 100 };
    // 左右に離して配置し、2枚が互いに重ならないようにする
    const a = { pos: O(-150, 0), radius: 92 };
    const b = { pos: O(150, 0), radius: 92 };
    expect(distanceBetween(a.pos, b.pos)).toBeGreaterThan(a.radius + b.radius);

    const sum =
      (circleOverlapArea(placed.pos, placed.radius, a.pos, a.radius) +
        circleOverlapArea(placed.pos, placed.radius, b.pos, b.radius)) /
      circleArea(placed.radius);

    expect(coverageRatio(placed, [a, b], S)).toBeCloseTo(sum, 2);
  });

  it('同じ位置に2枚重ねても被覆率は1枚分から増えない（二重計上しない）', () => {
    const placed = { pos: O(0, 0), radius: 100 };
    const t = { pos: O(80, 0), radius: 92 };
    const one = coverageRatio(placed, [t], S);
    const two = coverageRatio(placed, [t, { ...t }], S);
    expect(two).toBeCloseTo(one, 2);
    expect(one).toBeLessThan(0.5);
  });

  it('違う位置に2枚重ねれば被覆率が上がり、過半数を超えうる', () => {
    const placed = { pos: O(0, 0), radius: 100 };
    const a = { pos: O(-85, 0), radius: 92 };
    const b = { pos: O(85, 0), radius: 92 };
    const one = coverageRatio(placed, [a], S);
    const both = coverageRatio(placed, [a, b], S);

    expect(one).toBeLessThanOrEqual(0.5);
    expect(both).toBeGreaterThan(0.5);
    expect(both).toBeGreaterThan(one);
  });

  it('被覆率は常に 0..1 に収まり、枚数を増やしても単調非減少', () => {
    const placed = { pos: O(0, 0), radius: 100 };
    const discs = [
      { pos: O(-70, -40), radius: 92 },
      { pos: O(70, -40), radius: 92 },
      { pos: O(0, 80), radius: 92 },
    ];
    let prev = 0;
    for (let n = 0; n <= discs.length; n++) {
      const c = coverageRatio(placed, discs.slice(0, n), S);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
      expect(c).toBeGreaterThanOrEqual(prev - 0.01);
      prev = c;
    }
  });

  it('決定論的である（同じ入力から常に同じ値）', () => {
    const placed = { pos: O(3, -7), radius: 83 };
    const discs = [
      { pos: O(-40, 10), radius: 92 },
      { pos: O(55, -20), radius: 92 },
    ];
    const a = coverageRatio(placed, discs, S);
    const b = coverageRatio(placed, discs, S);
    expect(a).toBe(b);
  });
});
