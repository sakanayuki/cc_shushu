import Matter from 'matter-js';
import type { GameParams } from '../config/params.types';
import type { Layout } from '../core/coords';
import type { Vec2 } from '../core/types';

export const THROWN_LABEL_PREFIX = 'thrown:';

export function createThrownBody(
  id: number,
  pos: Vec2,
  radius: number,
  p: GameParams,
): Matter.Body {
  return Matter.Bodies.circle(pos.x, pos.y, radius, {
    label: `${THROWN_LABEL_PREFIX}${id}`,
    friction: p.physics.friction,
    frictionStatic: p.physics.frictionStatic,
    frictionAir: p.physics.frictionAir,
    restitution: p.physics.restitution,
    density: p.physics.density,
    slop: 0.02,
  });
}

/**
 * 左右と下の壁。上端は場外なので壁を置かない（docs/05-physics.md 5.3節）。
 * 高速なカードがすり抜けないよう厚めにし、盤面の外側に配置する。
 */
export function createWalls(layout: Layout, p: GameParams): Matter.Body[] {
  const t = 200;
  const w = layout.logicalWidth;
  const h = layout.logicalHeight;
  const opts: Matter.IChamferableBodyDefinition = {
    isStatic: true,
    restitution: p.physics.wallRestitution,
    friction: 0,
    frictionStatic: 0,
  };
  // 上方向は開いているので、左右の壁は上へ十分に伸ばしておく
  const tall = h * 2 + t * 2;
  return [
    Matter.Bodies.rectangle(-t / 2, h - tall / 2, t, tall, { ...opts, label: 'wall:left' }),
    Matter.Bodies.rectangle(w + t / 2, h - tall / 2, t, tall, { ...opts, label: 'wall:right' }),
    Matter.Bodies.rectangle(w / 2, h + t / 2, w + t * 2, t, { ...opts, label: 'wall:bottom' }),
  ];
}

export function parseThrownId(label: string): number | null {
  if (!label.startsWith(THROWN_LABEL_PREFIX)) return null;
  const n = Number(label.slice(THROWN_LABEL_PREFIX.length));
  return Number.isFinite(n) ? n : null;
}
