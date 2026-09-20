import type { Layout } from '../core/coords';
import type { BoardState, Phase, PlacedCard, TurnResult } from '../core/types';
import type { CanvasSurface } from './canvas';
import { defaultSkin } from './skins/defaultSkin';
import type { CardSkin, ThrownState } from './skins/types';
import { defaultTheme, type Theme } from './theme';

export interface FrameInput {
  readonly board: BoardState;
  readonly phase: Phase;
  readonly layout: Layout;
  /** 直前の決着結果。resolving 中の表示に使う */
  readonly turn: TurnResult | null;
  /** resolving の進捗 0..1 */
  readonly resolveProgress: number;
  /** 待機中のカードの位置（ready / aiming 中のみ） */
  readonly waitingPos: { x: number; y: number } | null;
  readonly waitingRadius: number;
  readonly bestScore: number;
  /** HUD の手札ドットの総数（初期手札枚数） */
  readonly handCapacity: number;
  /** 直前の投擲でロストしたカードがあるか（ロストラインの強調に使う） */
  readonly lostWarning: boolean;
}

export interface Renderer {
  draw(input: FrameInput): void;
  setTheme(theme: Theme): void;
  setSkin(skin: CardSkin): void;
  /** Retry ボタンの当たり判定（CSS px）。gameover 以外では null */
  getRetryRect(): { x: number; y: number; w: number; h: number } | null;
}

export function createRenderer(
  surface: CanvasSurface,
  theme: Theme = defaultTheme,
  skin: CardSkin = defaultSkin,
): Renderer {
  let currentTheme = theme;
  let currentSkin = skin;
  let retryRect: { x: number; y: number; w: number; h: number } | null = null;

  function drawBoardChrome(ctx: CanvasRenderingContext2D, l: Layout, warn: boolean): void {
    ctx.fillStyle = currentTheme.background;
    ctx.fillRect(0, 0, l.logicalWidth, l.logicalHeight);

    // 射出領域
    ctx.fillStyle = currentTheme.launchZone;
    ctx.fillRect(0, l.launchZoneTop, l.logicalWidth, l.logicalHeight - l.launchZoneTop);

    // ロストライン。越えたらカードを失うことが見えている必要がある。
    ctx.save();
    ctx.setLineDash([18, 14]);
    ctx.lineWidth = warn ? 6 : 3;
    ctx.strokeStyle = warn ? currentTheme.lostLineWarn : currentTheme.lostLine;
    ctx.beginPath();
    ctx.moveTo(0, 3);
    ctx.lineTo(l.logicalWidth, 3);
    ctx.stroke();
    ctx.restore();

    // 射出ライン
    ctx.save();
    ctx.setLineDash([10, 12]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = currentTheme.launchLine;
    ctx.beginPath();
    ctx.moveTo(0, l.launchZoneTop);
    ctx.lineTo(l.logicalWidth, l.launchZoneTop);
    ctx.stroke();
    ctx.restore();
  }

  function drawHud(
    ctx: CanvasRenderingContext2D,
    l: Layout,
    board: BoardState,
    initialHand: number,
  ): void {
    const y = 58;
    ctx.save();
    ctx.font = `600 32px ${currentTheme.fontFamily}`;
    ctx.textBaseline = 'middle';

    ctx.textAlign = 'left';
    ctx.fillStyle = currentTheme.hud.dim;
    ctx.fillText('HAND', 40, y);

    const dotR = 13;
    const startX = 40 + ctx.measureText('HAND').width + 34;
    for (let i = 0; i < initialHand; i++) {
      ctx.beginPath();
      ctx.arc(startX + i * 38, y, dotR, 0, Math.PI * 2);
      ctx.fillStyle = i < board.hand ? currentTheme.hud.handFilled : currentTheme.hud.handEmpty;
      ctx.fill();
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = currentTheme.hud.text;
    ctx.font = `700 46px ${currentTheme.fontFamily}`;
    ctx.fillText(String(board.score), l.logicalWidth - 40, y);
    ctx.restore();
  }

  function drawResult(
    ctx: CanvasRenderingContext2D,
    l: Layout,
    board: BoardState,
    bestScore: number,
  ): void {
    ctx.save();
    ctx.fillStyle = currentTheme.result.overlay;
    ctx.fillRect(0, 0, l.logicalWidth, l.logicalHeight);

    const cx = l.logicalWidth / 2;
    const cy = l.logicalHeight / 2;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = currentTheme.result.dim;
    ctx.font = `600 44px ${currentTheme.fontFamily}`;
    ctx.fillText('SCORE', cx, cy - 190);

    ctx.fillStyle = currentTheme.result.text;
    ctx.font = `800 170px ${currentTheme.fontFamily}`;
    ctx.fillText(String(board.score), cx, cy - 70);

    ctx.fillStyle = currentTheme.result.dim;
    ctx.font = `600 38px ${currentTheme.fontFamily}`;
    ctx.fillText(`BEST  ${bestScore}`, cx, cy + 40);

    const bw = 420;
    const bh = 120;
    const bx = cx - bw / 2;
    const by = cy + 110;
    ctx.fillStyle = currentTheme.result.buttonFill;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 60);
    ctx.fill();

    ctx.fillStyle = currentTheme.result.buttonText;
    ctx.font = `700 52px ${currentTheme.fontFamily}`;
    ctx.fillText('RETRY', cx, by + bh / 2);
    ctx.restore();

    retryRect = {
      x: bx * l.scale + l.offsetX,
      y: by * l.scale + l.offsetY,
      w: bw * l.scale,
      h: bh * l.scale,
    };
  }

  return {
    setTheme(t) {
      currentTheme = t;
    },
    setSkin(s) {
      currentSkin = s;
    },
    getRetryRect() {
      return retryRect;
    },

    draw(input) {
      const { ctx } = surface;
      const l = input.layout;

      if (input.phase !== 'gameover') retryRect = null;

      // レターボックス（盤面外）
      ctx.fillStyle = currentTheme.outOfBounds;
      ctx.fillRect(0, 0, surface.width, surface.height);

      ctx.save();
      ctx.translate(l.offsetX, l.offsetY);
      ctx.scale(l.scale, l.scale);
      // 盤面外へはみ出す描画を切り落とす
      ctx.beginPath();
      ctx.rect(0, 0, l.logicalWidth, l.logicalHeight);
      ctx.clip();

      drawBoardChrome(ctx, l, input.lostWarning);

      // 置きカードを先に描くことで、投げカードが上に重なって見える。
      // 「覆っている」というルールの視覚的な表現そのものになる。
      const capturedIds = new Set(input.turn?.capturedCards.map((c) => c.id) ?? []);
      const fade = input.phase === 'resolving' ? 1 - Math.min(1, input.resolveProgress) : 1;

      for (const card of input.board.placed) {
        currentSkin.drawPlacedCard(ctx, card, currentTheme, 1);
      }
      // 獲得されたカードは既に board から消えているので、turn から復元して薄く描く
      if (input.phase === 'resolving' && input.turn) {
        for (const card of input.turn.capturedCards) {
          currentSkin.drawPlacedCard(ctx, card, currentTheme, fade);
        }
      }

      const overlappingIds = new Set<number>();
      for (const c of input.turn?.coverages ?? []) {
        for (const id of c.coveringThrownIds) overlappingIds.add(id);
      }

      for (const card of input.board.thrown) {
        const state: ThrownState =
          input.phase === 'flying' ? 'flying' : overlappingIds.has(card.id) ? 'grazing' : 'flying';
        currentSkin.drawThrownCard(ctx, card, state, currentTheme, 1);
      }

      if (input.waitingPos) {
        currentSkin.drawThrownCard(
          ctx,
          {
            id: -1,
            pos: input.waitingPos,
            velocity: { x: 0, y: 0 },
            radius: input.waitingRadius,
          },
          'waiting',
          currentTheme,
          1,
        );
      }

      // 被覆率表示。未獲得のカードにも出すことで失敗理由を数値化する。
      if (input.phase === 'resolving' && input.turn) {
        const byId = new Map<number, PlacedCard>();
        for (const c of input.board.placed) byId.set(c.id, c);
        for (const c of input.turn.capturedCards) byId.set(c.id, c);

        for (const cov of input.turn.coverages) {
          const card = byId.get(cov.placedId);
          if (!card) continue;
          const alpha = capturedIds.has(card.id) ? 1 : Math.min(1, 1.4 - input.resolveProgress);
          currentSkin.drawCoverageLabel(
            ctx,
            card,
            cov.coverage,
            cov.captured,
            currentTheme,
            Math.max(0, alpha),
          );
        }
      }

      drawHud(ctx, l, input.board, input.handCapacity);

      if (input.phase === 'gameover') {
        drawResult(ctx, l, input.board, input.bestScore);
      }

      ctx.restore();
    },
  };
}
