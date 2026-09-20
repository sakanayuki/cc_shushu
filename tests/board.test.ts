import { describe, expect, it } from 'vitest';
import { createInitialBoard, refillSlot } from '../src/core/board';
import { computeLayout } from '../src/core/coords';
import { circleArea, distance } from '../src/core/geometry';
import { createRng } from '../src/core/rng';
import { board, layout, params, thrown } from './helpers';

const P = params();
const L = layout(P);

describe('createInitialBoard', () => {
  it('あらゆるシードで全ての配置制約を満たす', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const b = createInitialBoard(createRng(seed), P, L);
      for (const card of b.placed) {
        // C1: 盤面端からのマージン
        expect(card.pos.x - card.radius).toBeGreaterThanOrEqual(P.layout.edgeMargin - 1e-9);
        expect(card.pos.x + card.radius).toBeLessThanOrEqual(
          L.logicalWidth - P.layout.edgeMargin + 1e-9,
        );
        // C2: 配置可能域
        expect(card.pos.y - card.radius).toBeGreaterThanOrEqual(L.placedAreaTop - 1e-9);
        expect(card.pos.y + card.radius).toBeLessThanOrEqual(L.placedAreaBottom + 1e-9);
        // C3: カード同士が重ならない
        for (const other of b.placed) {
          if (other.id === card.id) continue;
          expect(distance(card.pos, other.pos)).toBeGreaterThanOrEqual(
            card.radius + other.radius - 1e-9,
          );
        }
      }
    }
  });

  it('射出領域に置きカードを配置しない', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const b = createInitialBoard(createRng(seed), P, L);
      for (const card of b.placed) {
        expect(card.pos.y + card.radius).toBeLessThan(L.launchZoneTop);
      }
    }
  });

  it('難易度構成が常に Easy2 / Normal2 / Hard1 になる', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const b = createInitialBoard(createRng(seed), P, L);
      expect(b.placed).toHaveLength(5);
      const counts = { easy: 0, normal: 0, hard: 0 };
      for (const c of b.placed) counts[c.difficulty]++;
      expect(counts).toEqual({ easy: 2, normal: 2, hard: 1 });
    }
  });

  it('得点と半径が難易度帯の範囲内に収まる', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const b = createInitialBoard(createRng(seed), P, L);
      for (const card of b.placed) {
        const slot = P.board.slots[card.slotIndex]!;
        expect(card.score).toBeGreaterThanOrEqual(slot.scoreMin);
        expect(card.score).toBeLessThanOrEqual(slot.scoreMax);
        expect(Number.isInteger(card.score)).toBe(true);
        expect(card.radius).toBeGreaterThanOrEqual(slot.radiusMin);
        expect(card.radius).toBeLessThanOrEqual(slot.radiusMax);
      }
    }
  });

  it('どの難易度でも投げカード1枚で閾値を超えられる', () => {
    // 中心を完全に一致させたときの被覆率が captureThreshold を超えること。
    // 半径そのものの大小ではなく、これが成立していることが設計上の不変条件。
    const thrownArea = circleArea(P.card.thrownRadius);
    for (const slot of P.board.slots) {
      const placedArea = circleArea(slot.radiusMax);
      const maxCoverage = Math.min(1, thrownArea / placedArea);
      expect(maxCoverage).toBeGreaterThan(P.rule.captureThreshold);
    }
  });

  it('同じシードから必ず同じ盤面が生成される', () => {
    const a = createInitialBoard(createRng(777), P, L);
    const b = createInitialBoard(createRng(777), P, L);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('異なる端末サイズでも制約を満たす', () => {
    const sizes: [number, number][] = [
      [375, 667],
      [393, 852],
      [412, 915],
      [820, 1180],
    ];
    for (const [w, h] of sizes) {
      const lay = computeLayout(w, h, P.layout);
      for (let seed = 1; seed <= 100; seed++) {
        const b = createInitialBoard(createRng(seed), P, lay);
        expect(b.placed).toHaveLength(5);
        for (const card of b.placed) {
          expect(card.pos.y - card.radius).toBeGreaterThanOrEqual(lay.placedAreaTop - 1e-9);
          expect(card.pos.y + card.radius).toBeLessThanOrEqual(lay.placedAreaBottom + 1e-9);
        }
      }
    }
  });
});

describe('refillSlot', () => {
  it('補充カードは既存の投げカードと重ならない', () => {
    // 盤面に投げカードを敷き詰め、補充が重ならないことを確認する
    for (let seed = 1; seed <= 300; seed++) {
      const rng = createRng(seed);
      const thrownCards = Array.from({ length: 4 }, (_, i) =>
        thrown(100 + i, rng.range(100, 900), rng.range(250, 1100)),
      );
      const b = board({ thrown: thrownCards });
      const card = refillSlot(b, 2, rng, P, L, 1);
      if (!card) continue;
      for (const t of thrownCards) {
        expect(distance(card.pos, t.pos)).toBeGreaterThanOrEqual(
          card.radius + t.radius + P.board.refillClearance - 1e-9,
        );
      }
    }
  });

  it('存在しないスロット番号では null を返す', () => {
    expect(refillSlot(board(), 99, createRng(1), P, L, 1)).toBeNull();
  });
});
