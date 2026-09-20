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
