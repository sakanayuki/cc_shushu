import type { LayoutParams } from '../config/params.types';
import { clamp } from './geometry';
import type { Vec2 } from './types';

export interface Layout {
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly launchY: number;
  readonly launchZoneTop: number;
  readonly placedAreaTop: number;
  readonly placedAreaBottom: number;
  /** 論理→画面のスケール係数 */
  readonly scale: number;
  /** レターボックスのオフセット（CSS px） */
  readonly offsetX: number;
  readonly offsetY: number;
}

/**
 * ビューポートサイズから論理座標系とレイアウトを決める。
 * 論理幅は固定、論理高さはアスペクト比追従だがクランプする（docs/05-physics.md 5.1節）。
 */
export function computeLayout(
  viewportWidth: number,
  viewportHeight: number,
  p: LayoutParams,
): Layout {
  const logicalWidth = p.logicalWidth;
  const raw = (logicalWidth * viewportHeight) / viewportWidth;
  const logicalHeight = clamp(raw, p.logicalHeightMin, p.logicalHeightMax);

  const scale = Math.min(viewportWidth / logicalWidth, viewportHeight / logicalHeight);
  const offsetX = (viewportWidth - logicalWidth * scale) / 2;
  const offsetY = (viewportHeight - logicalHeight * scale) / 2;

  const launchY = logicalHeight - p.launchOffsetY;
  const launchZoneTop = logicalHeight - p.launchZoneHeight;

  return {
    logicalWidth,
    logicalHeight,
    launchY,
    launchZoneTop,
    placedAreaTop: p.lostClearance,
    placedAreaBottom: launchZoneTop - p.launchClearance,
    scale,
    offsetX,
    offsetY,
  };
}

export function logicalToScreen(p: Vec2, l: Layout): Vec2 {
  return { x: p.x * l.scale + l.offsetX, y: p.y * l.scale + l.offsetY };
}

export function screenToLogical(p: Vec2, l: Layout): Vec2 {
  return { x: (p.x - l.offsetX) / l.scale, y: (p.y - l.offsetY) / l.scale };
}
