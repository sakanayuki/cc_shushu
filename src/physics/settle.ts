import type Matter from 'matter-js';
import type { SettleParams } from '../config/params.types';

export interface Settler {
  /** 毎ステップ呼ぶ。停止条件を満たし続けた時間を内部で累積する */
  update(bodies: readonly Matter.Body[], dtMs: number): void;
  isSettled(): boolean;
  /** 停止確定時に速度を0へ丸め、次の盤面を完全に確定させる */
  freeze(bodies: readonly Matter.Body[]): void;
  reset(): void;
}

export function createSettler(p: SettleParams, setZero: (b: Matter.Body) => void): Settler {
  let quietMs = 0;

  return {
    update(bodies, dtMs) {
      const allQuiet = bodies.every(
        (b) => b.speed < p.stopSpeed && Math.abs(b.angularSpeed) < p.stopAngularSpeed,
      );
      quietMs = allQuiet ? quietMs + dtMs : 0;
    },
    isSettled() {
      return quietMs >= p.stopDurationMs;
    },
    freeze(bodies) {
      for (const b of bodies) setZero(b);
      quietMs = p.stopDurationMs;
    },
    reset() {
      quietMs = 0;
    },
  };
}
