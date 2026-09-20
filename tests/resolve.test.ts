import { describe, expect, it } from 'vitest';
import { resolveTurn } from '../src/core/resolve';
import { createRng } from '../src/core/rng';
import type { BoardState } from '../src/core/types';
import { board, layout, params, placed, thrown } from './helpers';

const P = params();
const L = layout(P);
const rng = () => createRng(1);

describe('resolveTurn — 獲得判定', () => {
  it('被覆率が50%を超えたカードを獲得する', () => {
    // 半径25の置きカードを半径46の投げカードが中心から覆う → 100%
    const b = board({ placed: [placed(1, 500, 600, 25, 70)], thrown: [thrown(10, 500, 600)] });
    const r = resolveTurn(b, rng(), P, L);
    expect(r.capturedCards.map((c) => c.id)).toEqual([1]);
    expect(r.gainedScore).toBe(70);
  });

  it('被覆率が閾値以下のカードは獲得しない', () => {
    // 半径25、中心間距離を大きく取り、被覆率を50%未満にする
    const b = board({ placed: [placed(1, 500, 600, 25, 70)], thrown: [thrown(10, 500 + 60, 600)] });
    const r = resolveTurn(b, rng(), P, L);
    expect(r.capturedCards).toHaveLength(0);
    expect(r.gainedScore).toBe(0);
    expect(r.coverages[0]!.coverage).toBeLessThanOrEqual(0.5);
  });

  it('ちょうど閾値ぴったりでは獲得しない（厳密な不等号）', () => {
    const b = board({ placed: [placed(1, 500, 600, 25)], thrown: [] });
    // coverage 0 のケースで captured が false であることを確認
    const r = resolveTurn(b, rng(), P, L);
    expect(r.coverages[0]!.captured).toBe(false);
  });

  it('獲得に寄与した投げカードが手札に戻る', () => {
    const b = board({
      hand: 2,
      placed: [placed(1, 500, 600, 25)],
      thrown: [thrown(10, 500, 600)],
    });
    const r = resolveTurn(b, rng(), P, L);
    expect(r.collectedThrownIds).toEqual([10]);
    expect(r.nextBoard.hand).toBe(3);
    expect(r.nextBoard.thrown).toHaveLength(0);
  });
});

describe('resolveTurn — 複数枚の合算', () => {
  it('複数枚の面積合計で過半数に達した場合、全て回収される', () => {
    // 半径46の置きカードを、半径46の投げカード2枚が左右から挟む。
    // 1枚では50%に届かないが、2枚の合計で超える配置にする。
    const pr = 46;
    const b = board({
      hand: 0,
      placed: [placed(1, 500, 600, pr, 40)],
      thrown: [thrown(10, 500 - 44, 600), thrown(11, 500 + 44, 600)],
    });
    const single = resolveTurn(
      board({ hand: 0, placed: [placed(1, 500, 600, pr, 40)], thrown: [thrown(10, 500 - 44, 600)] }),
      rng(),
      P,
      L,
    );
    expect(single.capturedCards).toHaveLength(0);

    const r = resolveTurn(b, rng(), P, L);
    expect(r.capturedCards.map((c) => c.id)).toEqual([1]);
    expect([...r.collectedThrownIds].sort()).toEqual([10, 11]);
    expect(r.nextBoard.hand).toBe(2);
  });

  it('1枚が2つのカードを獲得させても、手札は1枚しか増えない', () => {
    // 小さな置きカード2枚を、1枚の投げカードがまたいで両方50%超を覆う
    const b = board({
      hand: 0,
      placed: [placed(1, 480, 600, 18, 60, 4), placed(2, 520, 600, 18, 80, 4)],
      thrown: [thrown(10, 500, 600)],
    });
    const r = resolveTurn(b, rng(), P, L);
    expect(r.capturedCards).toHaveLength(2);
    expect(r.gainedScore).toBe(140);
    expect(r.collectedThrownIds).toEqual([10]);
    expect(r.nextBoard.hand).toBe(1);
  });
});

describe('resolveTurn — 空振りと掠り', () => {
  it('どのカードにも重ならない投げカードは除去され、手札に戻らない', () => {
    const b = board({
      hand: 1,
      placed: [placed(1, 200, 400, 30)],
      thrown: [thrown(10, 800, 900)],
    });
    const r = resolveTurn(b, rng(), P, L);
    expect(r.whiffedThrownIds).toEqual([10]);
    expect(r.nextBoard.hand).toBe(1);
    expect(r.nextBoard.thrown).toHaveLength(0);
  });

  it('接するだけ（重なり面積0）の投げカードは空振り扱いになる', () => {
    const b = board({
      hand: 1,
      placed: [placed(1, 500, 600, 30)],
      thrown: [thrown(10, 500 + 76, 600)], // 30 + 46 = 76 でちょうど外接
    });
    const r = resolveTurn(b, rng(), P, L);
    expect(r.whiffedThrownIds).toEqual([10]);
  });

  it('掠り（重なるが未獲得）の投げカードは盤面に残る', () => {
    const b = board({
      hand: 1,
      placed: [placed(1, 500, 600, 46)],
      thrown: [thrown(10, 500 + 70, 600)],
    });
    const r = resolveTurn(b, rng(), P, L);
    expect(r.capturedCards).toHaveLength(0);
    expect(r.whiffedThrownIds).toHaveLength(0);
    expect(r.nextBoard.thrown.map((t) => t.id)).toEqual([10]);
    expect(r.nextBoard.hand).toBe(1);
  });
});

describe('resolveTurn — 補充と終了', () => {
  it('獲得されたスロットが同じ難易度で補充される', () => {
    const b = board({
      hand: 1,
      placed: [placed(1, 500, 600, 25, 70, 4)],
      thrown: [thrown(10, 500, 600)],
    });
    const r = resolveTurn(b, rng(), P, L);
    const refilled = r.nextBoard.placed.filter((c) => c.slotIndex === 4);
    expect(refilled).toHaveLength(1);
    expect(refilled[0]!.difficulty).toBe('hard');
    expect(refilled[0]!.id).not.toBe(1);
  });

  it('空いているスロットは獲得がなくても補充される', () => {
    // 置きカードが1枚もない盤面 → 全スロットが埋まる
    const b = board({ hand: 1, placed: [], thrown: [] });
    const r = resolveTurn(b, rng(), P, L);
    expect(r.nextBoard.placed).toHaveLength(P.board.slots.length);
  });

  it('手札が0になったら isGameOver が true になる', () => {
    const b = board({ hand: 0, placed: [placed(1, 200, 400, 30)], thrown: [thrown(10, 800, 900)] });
    const r = resolveTurn(b, rng(), P, L);
    expect(r.nextBoard.hand).toBe(0);
    expect(r.isGameOver).toBe(true);
  });

  it('獲得で手札が戻ればゲームは続く', () => {
    const b = board({ hand: 0, placed: [placed(1, 500, 600, 25)], thrown: [thrown(10, 500, 600)] });
    const r = resolveTurn(b, rng(), P, L);
    expect(r.isGameOver).toBe(false);
  });

  it('未獲得カードの被覆率も coverages に含まれる', () => {
    const b = board({
      placed: [placed(1, 500, 600, 30), placed(2, 200, 300, 30, 20, 1)],
      thrown: [thrown(10, 500, 600)],
    });
    const r = resolveTurn(b, rng(), P, L);
    expect(r.coverages).toHaveLength(2);
    expect(r.coverages.find((c) => c.placedId === 2)!.coverage).toBe(0);
  });

  it('入力の BoardState を破壊しない（純粋性）', () => {
    const b = board({ placed: [placed(1, 500, 600, 25)], thrown: [thrown(10, 500, 600)] });
    const snapshot = JSON.stringify(b);
    resolveTurn(b, rng(), P, L);
    expect(JSON.stringify(b)).toBe(snapshot);
  });
});

describe('resolveTurn — 不変条件', () => {
  function randomBoard(seed: number): BoardState {
    const r = createRng(seed);
    const placedCards = Array.from({ length: r.int(0, 5) }, (_, i) =>
      placed(i + 1, r.range(100, 900), r.range(250, 1200), r.range(18, 50), r.int(10, 100), i),
    );
    const thrownCards = Array.from({ length: r.int(0, 5) }, (_, i) =>
      thrown(100 + i, r.range(100, 900), r.range(250, 1400)),
    );
    return board({
      placed: placedCards,
      thrown: thrownCards,
      hand: r.int(0, 5),
      score: r.int(0, 500),
    });
  }

  it('カード総数（手札＋盤面）は単調減少する', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const b = randomBoard(seed);
      const before = b.hand + b.thrown.length;
      const after = resolveTurn(b, createRng(seed), P, L).nextBoard;
      expect(after.hand + after.thrown.length).toBeLessThanOrEqual(before);
    }
  });

  it('得点は減らない', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const b = randomBoard(seed);
      const after = resolveTurn(b, createRng(seed), P, L).nextBoard;
      expect(after.score).toBeGreaterThanOrEqual(b.score);
    }
  });

  it('置きカードはスロット数を超えない', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const b = randomBoard(seed);
      const after = resolveTurn(b, createRng(seed), P, L).nextBoard;
      expect(after.placed.length).toBeLessThanOrEqual(P.board.slots.length);
    }
  });

  it('スロットが重複しない', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const b = randomBoard(seed);
      const after = resolveTurn(b, createRng(seed), P, L).nextBoard;
      const slots = after.placed.map((c) => c.slotIndex);
      expect(new Set(slots).size).toBe(slots.length);
    }
  });

  it('IDが重複しない', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const b = randomBoard(seed);
      const after = resolveTurn(b, createRng(seed), P, L).nextBoard;
      const ids = after.placed.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
