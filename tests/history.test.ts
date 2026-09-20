import { describe, expect, it } from 'vitest';
import { createSampleHistory } from '../src/input/history';

describe('createSampleHistory', () => {
  it('時間窓内のサンプルを古い順に返す', () => {
    const h = createSampleHistory(8);
    for (let i = 0; i < 5; i++) h.push(i * 10, i, i);
    const recent = h.recent(40, 25);
    expect(recent.map((s) => s.t)).toEqual([20, 30, 40]);
  });

  it('時間窓外の古いサンプルを無視する', () => {
    const h = createSampleHistory(8);
    h.push(0, 0, 0);
    h.push(100, 1, 1);
    expect(h.recent(100, 50).map((s) => s.t)).toEqual([100]);
  });

  it('容量を超えると古いものから捨て、順序を保つ', () => {
    const h = createSampleHistory(3);
    for (let i = 0; i < 6; i++) h.push(i * 10, i, i);
    expect(h.recent(50, 1000).map((s) => s.t)).toEqual([30, 40, 50]);
  });

  it('clear で空になる', () => {
    const h = createSampleHistory(4);
    h.push(0, 0, 0);
    h.clear();
    expect(h.recent(0, 1000)).toEqual([]);
  });

  it('容量ちょうどでも順序が崩れない', () => {
    const h = createSampleHistory(3);
    for (let i = 0; i < 3; i++) h.push(i * 10, i, i);
    expect(h.recent(20, 1000).map((s) => s.t)).toEqual([0, 10, 20]);
  });
});
