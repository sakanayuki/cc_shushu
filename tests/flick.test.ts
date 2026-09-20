import { describe, expect, it } from 'vitest';
import { computeLayout } from '../src/core/coords';
import { estimateLaunchVelocity, type PointerSample } from '../src/core/flick';
import { params } from './helpers';

const P = params().flick;

/** 等速直線運動のサンプル列を作る（速度の単位は論理px/ms） */
function linear(vx: number, vy: number, n = 6, dt = 12): PointerSample[] {
  return Array.from({ length: n }, (_, i) => ({ t: i * dt, x: vx * i * dt, y: vy * i * dt }));
}

describe('estimateLaunchVelocity', () => {
  it('等速直線運動から正しい方向を推定する', () => {
    const e = estimateLaunchVelocity(linear(0, -3), P);
    expect(e).not.toBeNull();
    expect(e!.velocity.x).toBeCloseTo(0, 6);
    expect(e!.velocity.y).toBeLessThan(0);
  });

  it('等速直線運動では回帰値とピーク値が一致する', () => {
    const e = estimateLaunchVelocity(linear(2, -4), P)!;
    expect(e.regressSpeed).toBeCloseTo(e.peakSpeed, 6);
    expect(e.fingerSpeed).toBeCloseTo(Math.hypot(2, 4), 6);
  });

  it('初速の大きさが flickPower に比例する', () => {
    const e = estimateLaunchVelocity(linear(0, -4), P)!;
    expect(Math.hypot(e.velocity.x, e.velocity.y)).toBeCloseTo(4 * P.flickPower, 6);
  });

  it('サンプル数が不足している場合は null を返す', () => {
    expect(estimateLaunchVelocity(linear(0, -3, 2), P)).toBeNull();
  });

  it('全サンプルが同一時刻の場合は null を返す（ゼロ除算の保護）', () => {
    const samples: PointerSample[] = [
      { t: 5, x: 0, y: 0 },
      { t: 5, x: 1, y: 1 },
      { t: 5, x: 2, y: 2 },
    ];
    expect(estimateLaunchVelocity(samples, P)).toBeNull();
  });

  it('全サンプルが同一座標の場合は null を返す', () => {
    const samples: PointerSample[] = [
      { t: 0, x: 3, y: 3 },
      { t: 10, x: 3, y: 3 },
      { t: 20, x: 3, y: 3 },
    ];
    expect(estimateLaunchVelocity(samples, P)).toBeNull();
  });

  it('minFlickSpeed 未満の入力は null を返す', () => {
    // flickPower=6 なので 0.1 px/ms → 0.6 で minFlickSpeed(16) 未満
    expect(estimateLaunchVelocity(linear(0, -0.1), P)).toBeNull();
  });

  it('受理される最弱のフリックは、最も手前のカードに届く', () => {
    // 「受理されるが何にも届かず、確実に手札を失う投擲」が存在しないことの回帰テスト。
    // 等加速度減速では総移動距離 = v0^2 / (2a)。
    const all = params();
    const reach =
      (all.flick.minFlickSpeed * all.flick.minFlickSpeed) / (2 * all.physics.linearDecel);

    for (const [vw, vh] of [
      [375, 667],
      [393, 852],
      [820, 1180],
    ] as [number, number][]) {
      const l = computeLayout(vw, vh, all.layout);
      const span = l.placedAreaBottom - l.placedAreaTop;
      // 最も手前に置かれうるカード（Easy の distMin）
      const nearestDist = Math.min(
        ...all.board.slots.map((s) => l.launchY - (l.placedAreaBottom - span * s.distMin)),
      );
      const maxRadius = Math.max(...all.board.slots.map((s) => s.radiusMax));
      const needed = nearestDist - maxRadius - all.card.thrownRadius;
      expect(reach).toBeGreaterThan(needed);
    }
  });

  it('maxFlickSpeed を超える入力はクランプされ、clamped が立つ', () => {
    const e = estimateLaunchVelocity(linear(0, -50), P)!;
    expect(Math.hypot(e.velocity.x, e.velocity.y)).toBeCloseTo(P.maxFlickSpeed, 6);
    expect(e.clamped).toBe(true);
  });

  it('クランプ後も方向が保たれる', () => {
    const e = estimateLaunchVelocity(linear(30, -40), P)!;
    const mag = Math.hypot(e.velocity.x, e.velocity.y);
    expect(e.velocity.x / mag).toBeCloseTo(0.6, 6);
    expect(e.velocity.y / mag).toBeCloseTo(-0.8, 6);
  });

  it('クランプされない入力では clamped が false', () => {
    const e = estimateLaunchVelocity(linear(0, -3), P)!;
    expect(e.clamped).toBe(false);
  });

  it('peakBlend=0 なら回帰値のみを使う', () => {
    // 末尾で減速するサンプル。回帰は全体の傾き、ピークは序盤の速さを拾う。
    const samples: PointerSample[] = [
      { t: 0, x: 0, y: 0 },
      { t: 10, x: 0, y: -40 },
      { t: 20, x: 0, y: -80 },
      { t: 30, x: 0, y: -82 },
    ];
    const reg = estimateLaunchVelocity(samples, { ...P, peakBlend: 0 })!;
    const peak = estimateLaunchVelocity(samples, { ...P, peakBlend: 1 })!;
    expect(reg.fingerSpeed).toBeCloseTo(reg.regressSpeed, 6);
    expect(peak.fingerSpeed).toBeCloseTo(peak.peakSpeed, 6);
    // 離す直前の減速により、ピークのほうが速い
    expect(peak.peakSpeed).toBeGreaterThan(reg.regressSpeed);
  });

  it('peakBlend が大きいほど推定速度が大きくなる（減速サンプルの場合）', () => {
    const samples: PointerSample[] = [
      { t: 0, x: 0, y: 0 },
      { t: 10, x: 0, y: -40 },
      { t: 20, x: 0, y: -80 },
      { t: 30, x: 0, y: -82 },
    ];
    const low = estimateLaunchVelocity(samples, { ...P, peakBlend: 0 })!;
    const mid = estimateLaunchVelocity(samples, { ...P, peakBlend: 0.5 })!;
    const high = estimateLaunchVelocity(samples, { ...P, peakBlend: 1 })!;
    expect(mid.fingerSpeed).toBeGreaterThan(low.fingerSpeed);
    expect(high.fingerSpeed).toBeGreaterThan(mid.fingerSpeed);
  });
});
