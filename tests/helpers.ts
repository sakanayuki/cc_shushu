import { defaultParams } from '../src/config/params';
import type { GameParams } from '../src/config/params.types';
import { computeLayout, type Layout } from '../src/core/coords';
import type { BoardState, PlacedCard, ThrownCard } from '../src/core/types';

export function params(): GameParams {
  return structuredClone(defaultParams);
}

export function layout(p: GameParams = defaultParams): Layout {
  // iPhone 15 相当（クランプが効く縦長端末）
  return computeLayout(393, 852, p.layout);
}

export function placed(
  id: number,
  x: number,
  y: number,
  radius: number,
  score = 50,
  slotIndex = 0,
): PlacedCard {
  return { id, pos: { x, y }, radius, score, slotIndex, difficulty: 'normal' };
}

export function thrown(id: number, x: number, y: number, radius = 46): ThrownCard {
  return { id, pos: { x, y }, velocity: { x: 0, y: 0 }, radius };
}

export function board(partial: Partial<BoardState> = {}): BoardState {
  return {
    placed: [],
    thrown: [],
    hand: 3,
    score: 0,
    nextId: 1000,
    ...partial,
  };
}
