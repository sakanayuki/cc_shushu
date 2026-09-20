import type { GameParams, SlotDef } from '../config/params.types';
import type { Layout } from './coords';
import { distance } from './geometry';
import type { Rng } from './rng';
import type { BoardState, PlacedCard, Vec2 } from './types';

/**
 * 配置制約 C1〜C5（docs/07-board.md 7.3節）を満たすか。
 * gap は段階的緩和の対象だが、投げカードとの非重複(C4)は決して緩和しない。
 */
function satisfiesConstraints(
  pos: Vec2,
  radius: number,
  board: BoardState,
  p: GameParams,
  layout: Layout,
  gap: number,
): boolean {
  // C1: 盤面端からのマージン
  if (pos.x - radius < p.layout.edgeMargin) return false;
  if (pos.x + radius > layout.logicalWidth - p.layout.edgeMargin) return false;

  // C2: 配置可能域の内側
  if (pos.y - radius < layout.placedAreaTop) return false;
  if (pos.y + radius > layout.placedAreaBottom) return false;

  // C3: 他の置きカードとの最小隙間
  for (const other of board.placed) {
    if (distance(pos, other.pos) < radius + other.radius + gap) return false;
  }

  // C4: 盤面に残っている投げカードと重ならない。
  // これを緩和すると、プレイヤーの入力なしに獲得が成立してしまう。
  for (const t of board.thrown) {
    if (distance(pos, t.pos) < radius + t.radius + p.board.refillClearance) return false;
  }

  return true;
}

/** 試行回数に応じて targetMinGap を段階的に緩和する */
function gapForAttempt(attempt: number, p: GameParams): number {
  const steps = p.board.gapRelaxSteps;
  if (steps.length === 0) return p.board.targetMinGap;
  const per = Math.max(1, Math.floor(p.board.maxPlacementAttempts / steps.length));
  const idx = Math.min(steps.length - 1, Math.floor(attempt / per));
  return steps[idx]!;
}

/**
 * 空いたスロットに置きカードを1枚生成する。
 * 制約を満たす位置が見つからない場合は null（その盤面は1枚少ないまま継続する）。
 */
export function refillSlot(
  board: BoardState,
  slotIndex: number,
  rng: Rng,
  p: GameParams,
  layout: Layout,
  id: number,
): PlacedCard | null {
  const slot: SlotDef | undefined = p.board.slots[slotIndex];
  if (!slot) return null;

  // 距離帯は配置可能域の下端(比率0)から上端(比率1)へのマッピングとして定義する。
  // 射出ライン基準にすると、論理高さが小さい端末で近距離帯が配置可能域の外に落ちる。
  const span = layout.placedAreaBottom - layout.placedAreaTop;

  for (let attempt = 0; attempt < p.board.maxPlacementAttempts; attempt++) {
    const radius = rng.range(slot.radiusMin, slot.radiusMax);
    // C5: 距離帯。比率で定義しているので論理高さが変わっても難易度の意味が保たれる。
    const y = layout.placedAreaBottom - span * rng.range(slot.distMin, slot.distMax);
    const x = rng.range(
      p.layout.edgeMargin + radius,
      layout.logicalWidth - p.layout.edgeMargin - radius,
    );
    const pos = { x, y };

    if (!satisfiesConstraints(pos, radius, board, p, layout, gapForAttempt(attempt, p))) {
      continue;
    }

    return {
      id,
      pos,
      radius,
      slotIndex,
      difficulty: slot.difficulty,
      score: rng.int(slot.scoreMin, slot.scoreMax),
    };
  }

  return null;
}

/** ゲーム開始時の盤面を生成する */
export function createInitialBoard(rng: Rng, p: GameParams, layout: Layout): BoardState {
  const placed: PlacedCard[] = [];
  let nextId = 1;

  for (let i = 0; i < p.board.slots.length; i++) {
    const partial: BoardState = {
      placed,
      thrown: [],
      hand: p.rule.initialHand,
      score: 0,
      nextId,
    };
    const card = refillSlot(partial, i, rng, p, layout, nextId);
    if (card) {
      placed.push(card);
      nextId++;
    }
  }

  return { placed, thrown: [], hand: p.rule.initialHand, score: 0, nextId };
}
