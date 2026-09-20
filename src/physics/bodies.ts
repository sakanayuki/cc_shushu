import Matter from 'matter-js';
import type { Vec2 } from '../core/types';

export const THROWN_LABEL_PREFIX = 'thrown:';

/**
 * 投げカードの剛体。
 *
 * isSensor により、投げカード同士は衝突せず**重なる**。これは意図的な仕様であり、
 * 被覆率を複数枚の重なり領域の和集合として積み上げるゲームルールの前提になっている
 * （docs/06-scoring.md）。衝突が一切ないため、Matter.js は実質的に等速運動の
 * 積分器としてのみ機能する。減速は stepper 側の等加速度減速が担う。
 */
export function createThrownBody(id: number, pos: Vec2, radius: number): Matter.Body {
  return Matter.Bodies.circle(pos.x, pos.y, radius, {
    label: `${THROWN_LABEL_PREFIX}${id}`,
    isSensor: true,
    frictionAir: 0,
    friction: 0,
    frictionStatic: 0,
    restitution: 0,
  });
}

export function parseThrownId(label: string): number | null {
  if (!label.startsWith(THROWN_LABEL_PREFIX)) return null;
  const n = Number(label.slice(THROWN_LABEL_PREFIX.length));
  return Number.isFinite(n) ? n : null;
}
