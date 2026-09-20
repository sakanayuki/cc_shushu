import type { GameParams } from './params.types';

/**
 * 全チューニングパラメータの既定値。
 * 各値の根拠は docs/09-tuning.md 9.3節を参照。
 * デバッグUIで変更した値は Copy JSON でここへ貼り戻す。
 */
export const defaultParams: GameParams = {
  flick: {
    flickPower: 6.0,
    minFlickSpeed: 16.0,
    maxFlickSpeed: 62.0,
    inputSampleWindowMs: 80,
    peakBlend: 0.35,
    minSamples: 3,
    maxHistory: 32,
  },
  card: {
    thrownRadius: 46,
  },
  physics: {
    frictionAir: 0.028,
    friction: 0,
    frictionStatic: 0,
    restitution: 0.35,
    wallRestitution: 0.2,
    density: 0.002,
    positionIterations: 8,
    velocityIterations: 6,
  },
  settle: {
    stopSpeed: 0.35,
    stopAngularSpeed: 0.02,
    stopDurationMs: 180,
    settleTimeoutMs: 6000,
    resolveDisplayMs: 900,
  },
  layout: {
    logicalWidth: 1000,
    logicalHeightMin: 1600,
    logicalHeightMax: 2100,
    launchOffsetY: 190,
    launchZoneHeight: 420,
    launchClearance: 220,
    lostClearance: 180,
    edgeMargin: 60,
    maxDpr: 2,
  },
  board: {
    // 半径はいずれも投げカードの半径 46 以下。1枚で閾値50%に到達できる保証。
    slots: [
      { difficulty: 'easy', distMin: 0.15, distMax: 0.4, radiusMin: 40, radiusMax: 50, scoreMin: 10, scoreMax: 20 },
      { difficulty: 'easy', distMin: 0.15, distMax: 0.4, radiusMin: 40, radiusMax: 50, scoreMin: 10, scoreMax: 20 },
      { difficulty: 'normal', distMin: 0.4, distMax: 0.7, radiusMin: 27, radiusMax: 38, scoreMin: 30, scoreMax: 50 },
      { difficulty: 'normal', distMin: 0.4, distMax: 0.7, radiusMin: 27, radiusMax: 38, scoreMin: 30, scoreMax: 50 },
      { difficulty: 'hard', distMin: 0.7, distMax: 0.95, radiusMin: 18, radiusMax: 25, scoreMin: 60, scoreMax: 100 },
    ],
    targetMinGap: 40,
    refillClearance: 20,
    maxPlacementAttempts: 200,
    gapRelaxSteps: [40, 20, 0],
  },
  rule: {
    initialHand: 5,
    captureThreshold: 0.5,
  },
};

/** 構造を保ったままディープコピーする（デバッグUIの Reset 用） */
export function cloneParams(p: GameParams): GameParams {
  return structuredClone(p);
}
