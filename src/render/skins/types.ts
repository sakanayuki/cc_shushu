import type { PlacedCard, ThrownCard } from '../../core/types';
import type { Theme } from '../theme';

export type ThrownState = 'flying' | 'grazing' | 'waiting';

/**
 * カードの描画実装（差し替え層2）。
 * 形そのものを変えたい場合はこのインターフェースの実装を差し替える。
 * レンダラはこれにのみ依存し、具体的な描き方を知らない。
 */
export interface CardSkin {
  drawPlacedCard(
    ctx: CanvasRenderingContext2D,
    card: PlacedCard,
    theme: Theme,
    alpha: number,
  ): void;

  /** 置きカードの得点ラベルのみを描く（投げカードより手前に重ねるため分離している） */
  drawPlacedScore(
    ctx: CanvasRenderingContext2D,
    card: PlacedCard,
    theme: Theme,
    alpha: number,
  ): void;

  drawThrownCard(
    ctx: CanvasRenderingContext2D,
    card: ThrownCard,
    state: ThrownState,
    theme: Theme,
    alpha: number,
  ): void;

  drawCoverageLabel(
    ctx: CanvasRenderingContext2D,
    card: PlacedCard,
    coverage: number,
    captured: boolean,
    theme: Theme,
    alpha: number,
  ): void;
}
