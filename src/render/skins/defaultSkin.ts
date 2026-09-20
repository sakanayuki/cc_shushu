import type { PlacedCard, ThrownCard } from '../../core/types';
import type { CardSkin, ThrownState } from './types';

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

export const defaultSkin: CardSkin = {
  drawPlacedCard(ctx, card, theme, alpha) {
    const v = theme.placedCard[card.difficulty];
    ctx.save();
    ctx.globalAlpha = alpha;

    circle(ctx, card.pos.x, card.pos.y, card.radius);
    ctx.fillStyle = v.fill;
    ctx.fill();
    ctx.lineWidth = v.strokeWidth;
    ctx.strokeStyle = v.stroke;
    ctx.stroke();

    // 内側にもう一本リングを引き、カードらしい縁取りにする
    circle(ctx, card.pos.x, card.pos.y, Math.max(2, card.radius - v.strokeWidth * 2));
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = v.stroke;
    ctx.globalAlpha = alpha * 0.45;
    ctx.stroke();

    ctx.restore();
  },

  drawPlacedScore(ctx, card, theme, alpha) {
    const v = theme.placedCard[card.difficulty];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = v.labelColor;
    ctx.font = `700 ${Math.round(card.radius * 0.7)}px ${theme.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 半透明の投げカードの上でも読めるよう縁取りする
    ctx.lineWidth = Math.max(3, card.radius * 0.1);
    ctx.strokeStyle = 'rgba(10, 16, 24, 0.75)';
    ctx.strokeText(String(card.score), card.pos.x, card.pos.y + card.radius * 0.03);
    ctx.fillText(String(card.score), card.pos.x, card.pos.y + card.radius * 0.03);
    ctx.restore();
  },

  drawThrownCard(ctx, card: ThrownCard, state: ThrownState, theme, alpha) {
    const v =
      state === 'waiting'
        ? theme.waitingCard
        : state === 'grazing'
          ? theme.grazingCard
          : theme.thrownCard;

    ctx.save();
    ctx.globalAlpha = alpha;

    circle(ctx, card.pos.x, card.pos.y, card.radius);
    ctx.fillStyle = v.fill;
    ctx.fill();
    ctx.lineWidth = v.strokeWidth;
    ctx.strokeStyle = v.stroke;
    ctx.stroke();

    // 中心を示す小さなドット。止めた位置を目視で確認しやすくする
    circle(ctx, card.pos.x, card.pos.y, Math.max(2, card.radius * 0.06));
    ctx.fillStyle = v.stroke;
    ctx.globalAlpha = alpha * 0.7;
    ctx.fill();

    ctx.restore();
  },

  drawCoverageLabel(ctx, card: PlacedCard, coverage, captured, theme, alpha) {
    const pct = Math.round(coverage * 100);
    const color = captured
      ? theme.coverageLabel.captured
      : coverage >= 0.4
        ? theme.coverageLabel.near
        : theme.coverageLabel.far;

    const text = captured ? `+${card.score}` : `${pct}%`;
    const y = card.pos.y - card.radius - 22;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `700 34px ${theme.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 背景の上でも読めるよう縁取りする
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(8, 12, 18, 0.85)';
    ctx.strokeText(text, card.pos.x, y);

    ctx.fillStyle = color;
    ctx.fillText(text, card.pos.x, y);
    ctx.restore();
  },
};
