import type { Vec2 } from './types';

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function circleArea(r: number): number {
  return Math.PI * r * r;
}

/**
 * 2つの円の重なり面積（レンズ面積）を解析的に求める。
 * サンプリングではなく解析解を使うため、「ちょうど50%」の境界で
 * 誤差による判定のブレが起きない（docs/06-scoring.md 6.1節）。
 */
export function circleOverlapArea(c1: Vec2, r1: number, c2: Vec2, r2: number): number {
  const d = distance(c1, c2);

  // 離れている（外接も含む）
  if (d >= r1 + r2) return 0;

  // 一方が他方を完全に内包している（内接も含む）
  if (d <= Math.abs(r1 - r2)) {
    const r = Math.min(r1, r2);
    return circleArea(r);
  }

  // 部分的に重なっている。
  // acos の引数は丸め誤差で ±1 をわずかに超えうるのでクランプする。
  const a1 = Math.acos(clamp((d * d + r1 * r1 - r2 * r2) / (2 * d * r1), -1, 1));
  const a2 = Math.acos(clamp((d * d + r2 * r2 - r1 * r1) / (2 * d * r2), -1, 1));
  // 平方根の中身も d ≒ r1+r2 のとき丸め誤差で負になりうる。
  const inner = (-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2);
  const tri = 0.5 * Math.sqrt(Math.max(0, inner));

  // 外接ぎりぎり(d ≒ r1+r2)では円弧項と三角形項がほぼ等しくなり、
  // 桁落ちで差が微小な負値になる。結果を物理的に妥当な範囲へ丸める。
  const area = r1 * r1 * a1 + r2 * r2 * a2 - tri;
  return clamp(area, 0, circleArea(Math.min(r1, r2)));
}

/** 円内に等面積で分布する決定論的なサンプル点（Vogel螺旋）の角度定数 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export interface Disc {
  readonly pos: Vec2;
  readonly radius: number;
}

/**
 * 置きカードが投げカード群にどれだけ覆われているかを 0..1 で返す。
 *
 * 投げカード同士は重なりうる（衝突しない）ため、個々の重なり面積を
 * 単純加算すると同じ領域を二重計上してしまう。したがって
 * **重なり領域の和集合**の面積を求める必要がある。
 *
 * 円の和集合面積に扱いやすい解析解はないため、重なる投げカードが2枚以上の場合は
 * 置きカードの内部に等面積で分布する決定論的なサンプル点を打ち、
 * 1枚以上に覆われた点の割合として求める。乱数は使わないので、
 * 同じ配置からは常に同じ値が返る。
 *
 * 重なる投げカードが1枚以下の場合は、解析解（レンズ面積）で厳密に求める。
 */
export function coverageRatio(
  placed: Disc,
  thrown: readonly Disc[],
  samples: number,
): number {
  const overlapping = thrown.filter(
    (t) => distance(placed.pos, t.pos) < placed.radius + t.radius,
  );

  if (overlapping.length === 0) return 0;

  if (overlapping.length === 1) {
    const t = overlapping[0]!;
    const area = circleOverlapArea(placed.pos, placed.radius, t.pos, t.radius);
    return clamp(area / circleArea(placed.radius), 0, 1);
  }

  const n = Math.max(1, Math.floor(samples));
  let covered = 0;

  for (let i = 0; i < n; i++) {
    // r = R√((i+0.5)/n) により、各サンプル点が等しい面積を代表する
    const r = placed.radius * Math.sqrt((i + 0.5) / n);
    const th = i * GOLDEN_ANGLE;
    const px = placed.pos.x + r * Math.cos(th);
    const py = placed.pos.y + r * Math.sin(th);

    for (const t of overlapping) {
      const dx = px - t.pos.x;
      const dy = py - t.pos.y;
      if (dx * dx + dy * dy <= t.radius * t.radius) {
        covered++;
        break;
      }
    }
  }

  return covered / n;
}
