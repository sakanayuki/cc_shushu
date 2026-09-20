import type { FlickParams } from '../config/params.types';
import { clamp } from './geometry';
import type { Vec2 } from './types';

export interface PointerSample {
  /** ms */
  readonly t: number;
  /** 論理座標 */
  readonly x: number;
  readonly y: number;
}

export interface FlickEstimate {
  /** 最終的な初速ベクトル（論理px/step） */
  readonly velocity: Vec2;
  /** 指の速度の大きさ（論理px/ms）。デバッグ表示用 */
  readonly fingerSpeed: number;
  /** 回帰による速度の大きさ（論理px/ms） */
  readonly regressSpeed: number;
  /** ピーク瞬間速度の大きさ（論理px/ms） */
  readonly peakSpeed: number;
  /** 上限にクランプされたか */
  readonly clamped: boolean;
}

/** x(t) を最小二乗法で1次回帰した傾き。求まらない場合は null */
function regressSlope(samples: readonly PointerSample[], pick: (s: PointerSample) => number): number | null {
  const n = samples.length;
  let tSum = 0;
  let vSum = 0;
  for (const s of samples) {
    tSum += s.t;
    vSum += pick(s);
  }
  const tMean = tSum / n;
  const vMean = vSum / n;

  let num = 0;
  let den = 0;
  for (const s of samples) {
    const dt = s.t - tMean;
    num += dt * (pick(s) - vMean);
    den += dt * dt;
  }
  if (den === 0) return null;
  return num / den;
}

/** 連続するサンプル間の瞬間速度のうち、大きさが最大のもの */
function peakVelocity(samples: readonly PointerSample[]): Vec2 {
  let best: Vec2 = { x: 0, y: 0 };
  let bestMag = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const dt = b.t - a.t;
    if (dt <= 0) continue;
    const v = { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
    const mag = Math.hypot(v.x, v.y);
    if (mag > bestMag) {
      bestMag = mag;
      best = v;
    }
  }
  return best;
}

/**
 * PointerMove 履歴から初速ベクトルを推定する。
 * 線形回帰にピーク速度をブレンドすることで、指を離す直前の無意識の減速と
 * 単一ノイズサンプルの双方に対処する（docs/04-input.md 4.4節）。
 * 投擲が成立しない場合は null を返す。
 */
export function estimateLaunchVelocity(
  samples: readonly PointerSample[],
  p: FlickParams,
): FlickEstimate | null {
  if (samples.length < p.minSamples) return null;

  const sx = regressSlope(samples, (s) => s.x);
  const sy = regressSlope(samples, (s) => s.y);
  if (sx === null || sy === null) return null;

  const vReg: Vec2 = { x: sx, y: sy };
  const vPeak = peakVelocity(samples);

  const k = clamp(p.peakBlend, 0, 1);
  const vBlend: Vec2 = {
    x: vReg.x * (1 - k) + vPeak.x * k,
    y: vReg.y * (1 - k) + vPeak.y * k,
  };

  const fingerSpeed = Math.hypot(vBlend.x, vBlend.y);
  if (fingerSpeed === 0) return null;

  const rawSpeed = fingerSpeed * p.flickPower;
  if (rawSpeed < p.minFlickSpeed) return null;

  const speed = Math.min(rawSpeed, p.maxFlickSpeed);
  const scale = speed / fingerSpeed;

  return {
    velocity: { x: vBlend.x * scale, y: vBlend.y * scale },
    fingerSpeed,
    regressSpeed: Math.hypot(vReg.x, vReg.y),
    peakSpeed: Math.hypot(vPeak.x, vPeak.y),
    clamped: rawSpeed > p.maxFlickSpeed,
  };
}
