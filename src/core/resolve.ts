import type { GameParams } from '../config/params.types';
import { refillSlot } from './board';
import type { Layout } from './coords';
import { coverageRatio, distance } from './geometry';
import type { Rng } from './rng';
import type { BoardState, CoverageResult, PlacedCard, TurnResult } from './types';

/**
 * 全カード停止後の盤面から、次の盤面と表示情報を導出する純粋関数。
 * 処理順序は docs/06-scoring.md 6.3節に固定されており、入れ替えると結果が変わる。
 */
export function resolveTurn(
  board: BoardState,
  rng: Rng,
  p: GameParams,
  layout: Layout,
): TurnResult {
  // [1] 被覆率の計算。
  // 投げカード同士は衝突せず重なりうるため、個々の重なり面積を単純加算すると
  // 二重計上になる。重なり領域の**和集合**として求める（coverageRatio）。
  const coverages: CoverageResult[] = board.placed.map((placed) => {
    const ids: number[] = [];
    for (const t of board.thrown) {
      if (distance(placed.pos, t.pos) < placed.radius + t.radius) ids.push(t.id);
    }
    const coverage = coverageRatio(placed, board.thrown, p.rule.coverageSamples);
    return {
      placedId: placed.id,
      coverage,
      coveringThrownIds: ids,
      // 「過半数を超えた時点」なので厳密な不等号
      captured: coverage > p.rule.captureThreshold,
    };
  });

  // [2] 獲得判定
  const capturedIds = new Set<number>();
  for (const c of coverages) {
    if (c.captured) capturedIds.add(c.placedId);
  }
  const capturedCards = board.placed.filter((c) => capturedIds.has(c.id));
  const gainedScore = capturedCards.reduce((s, c) => s + c.score, 0);

  // [3] 回収。1枚が複数カードの獲得に寄与しうるので Set で重複排除する。
  const collected = new Set<number>();
  for (const c of coverages) {
    if (!c.captured) continue;
    for (const id of c.coveringThrownIds) collected.add(id);
  }

  // [4] 空振り除去（どの置きカードにも重なっていない投げカード）
  const overlappingAny = new Set<number>();
  for (const c of coverages) {
    for (const id of c.coveringThrownIds) overlappingAny.add(id);
  }
  const whiffedThrownIds: number[] = [];
  for (const t of board.thrown) {
    if (!collected.has(t.id) && !overlappingAny.has(t.id)) whiffedThrownIds.push(t.id);
  }
  const whiffedSet = new Set(whiffedThrownIds);

  // [5] 掠り残留
  const nextThrown = board.thrown.filter((t) => !collected.has(t.id) && !whiffedSet.has(t.id));

  // [6] 補充。空いているスロットをすべて走査する。
  // 前回置けなかったスロットも、盤面が空けば次の決着で補充される。
  let placed: PlacedCard[] = board.placed.filter((c) => !capturedIds.has(c.id));
  let nextId = board.nextId;
  const occupied = new Set(placed.map((c) => c.slotIndex));
  for (let slotIndex = 0; slotIndex < p.board.slots.length; slotIndex++) {
    if (occupied.has(slotIndex)) continue;
    const partial: BoardState = {
      placed,
      thrown: nextThrown,
      hand: board.hand,
      score: board.score,
      nextId,
    };
    const card = refillSlot(partial, slotIndex, rng, p, layout, nextId);
    if (card) {
      placed = [...placed, card];
      nextId++;
    }
  }

  // [7] 終了判定
  const hand = board.hand + collected.size;

  return {
    nextBoard: {
      placed,
      thrown: nextThrown,
      hand,
      score: board.score + gainedScore,
      nextId,
    },
    coverages,
    capturedCards,
    collectedThrownIds: [...collected],
    whiffedThrownIds,
    gainedScore,
    isGameOver: hand === 0,
  };
}
