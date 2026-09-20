import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';

describe('createRng', () => {
  it('同じシードから同じ系列を生成する', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('異なるシードから異なる系列を生成する', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('next() が常に [0,1) に収まる', () => {
    const r = createRng(99);
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(min,max) が常に [min,max] の整数を返す', () => {
    const r = createRng(5);
    for (let i = 0; i < 10000; i++) {
      const v = r.int(10, 20);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(20);
    }
  });

  it('range(min,max) が常に [min,max) に収まる', () => {
    const r = createRng(6);
    for (let i = 0; i < 10000; i++) {
      const v = r.range(-3, 7);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(7);
    }
  });

  it('シード0でも不動点にならない', () => {
    const r = createRng(0);
    const seq = Array.from({ length: 10 }, () => r.next());
    expect(new Set(seq).size).toBeGreaterThan(1);
  });
});
