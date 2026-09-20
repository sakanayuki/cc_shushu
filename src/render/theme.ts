import type { Difficulty } from '../core/types';

export interface CardVisual {
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly labelColor: string;
}

/**
 * 見た目を決める値の層（差し替え層1）。
 * 色を変えたいだけならこのファイルを書き換えれば済む。
 * 当たり判定は core 側の半径で決まるため、ここを変えてもバランスは動かない。
 */
export interface Theme {
  readonly background: string;
  readonly outOfBounds: string;
  readonly lostLine: string;
  readonly lostLineWarn: string;
  readonly launchLine: string;
  readonly launchZone: string;
  readonly placedCard: Record<Difficulty, CardVisual>;
  readonly thrownCard: CardVisual;
  readonly grazingCard: CardVisual;
  readonly waitingCard: CardVisual;
  readonly coverageLabel: {
    readonly captured: string;
    readonly near: string;
    readonly far: string;
  };
  readonly hud: {
    readonly text: string;
    readonly dim: string;
    readonly handFilled: string;
    readonly handEmpty: string;
  };
  readonly result: {
    readonly overlay: string;
    readonly text: string;
    readonly dim: string;
    readonly buttonFill: string;
    readonly buttonText: string;
  };
  readonly fontFamily: string;
}

export const defaultTheme: Theme = {
  background: '#101822',
  outOfBounds: '#05080c',
  lostLine: '#3a4657',
  lostLineWarn: '#e0574a',
  launchLine: '#2a3442',
  launchZone: '#151f2b',
  placedCard: {
    easy: {
      fill: '#1f4d54',
      stroke: '#54c7c0',
      strokeWidth: 4,
      labelColor: '#d5fbf7',
    },
    normal: {
      fill: '#2a3f66',
      stroke: '#6699e8',
      strokeWidth: 4,
      labelColor: '#dee9ff',
    },
    hard: {
      fill: '#5b2a48',
      stroke: '#e069a8',
      strokeWidth: 4,
      labelColor: '#ffdcef',
    },
  },
  // 投げカードは半透明。下の置きカードと得点が透けて見えないと、
  // 「どこがまだ覆われていないか」を判断できず被覆を積み上げられない。
  thrownCard: {
    fill: 'rgba(232, 227, 213, 0.5)',
    stroke: '#fffdf6',
    strokeWidth: 4,
    labelColor: '#101822',
  },
  grazingCard: {
    fill: 'rgba(232, 227, 213, 0.5)',
    stroke: '#efe9d8',
    strokeWidth: 4,
    labelColor: '#101822',
  },
  waitingCard: {
    fill: '#f4efe1',
    stroke: '#ffffff',
    strokeWidth: 4,
    labelColor: '#101822',
  },
  coverageLabel: {
    captured: '#8ef2b0',
    near: '#f2d98e',
    far: '#8c97a6',
  },
  hud: {
    text: '#f0f4f8',
    dim: '#7d8b9c',
    handFilled: '#f4efe1',
    handEmpty: '#3a4657',
  },
  result: {
    overlay: 'rgba(8, 12, 18, 0.86)',
    text: '#f0f4f8',
    dim: '#7d8b9c',
    buttonFill: '#54c7c0',
    buttonText: '#0c1219',
  },
  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
};
