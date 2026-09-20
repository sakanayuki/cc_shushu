export interface Rng {
  /** [0, 1) の乱数 */
  next(): number;
  /** [min, max) の乱数 */
  range(min: number, max: number): number;
  /** [min, max] の整数乱数 */
  int(min: number, max: number): number;
  /** 現在の内部状態（再現用） */
  getState(): number;
}

/**
 * xorshift32 によるシード付き擬似乱数。
 * core 層では Math.random() を使わず、必ずこれを経由する（docs/07-board.md 7.1節）。
 */
export function createRng(seed: number): Rng {
  // state === 0 は xorshift の不動点。0 を返し続けてしまうので回避する。
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;

  const next32 = (): number => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };

  const unit = (): number => next32() / 0x100000000;

  return {
    next: unit,
    range: (min, max) => min + unit() * (max - min),
    int: (min, max) => min + Math.floor(unit() * (max - min + 1)),
    getState: () => state,
  };
}
