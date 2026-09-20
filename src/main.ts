import { defaultParams } from './config/params';
import type { GameParams } from './config/params.types';
import { createInitialBoard } from './core/board';
import { computeLayout, type Layout } from './core/coords';
import { estimateLaunchVelocity, type FlickEstimate } from './core/flick';
import { clamp } from './core/geometry';
import { resolveTurn } from './core/resolve';
import { createRng, type Rng } from './core/rng';
import type { BoardState, Phase, TurnResult, Vec2 } from './core/types';
import { createPointerInput } from './input/pointer';
import { createPhysicsWorld, type PhysicsWorld } from './physics/world';
import { createCanvasSurface } from './render/canvas';
import { createRenderer } from './render/renderer';
import { createDebugPanel, loadStoredParams, type DebugPanel } from './ui/debugPanel';

const BEST_SCORE_KEY = 'cc_shushu:best';
const MAX_FRAME_MS = 100;

function readBestScore(): number {
  try {
    const raw = localStorage.getItem(BEST_SCORE_KEY);
    const n = raw === null ? 0 : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeBestScore(v: number): void {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(v));
  } catch {
    // 保存できなくてもゲームは続行できる
  }
}

function initialSeed(query: URLSearchParams): number {
  const raw = query.get('seed');
  if (raw !== null) {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.abs(Math.floor(n)) >>> 0;
  }
  return Date.now() >>> 0;
}

function main(): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('#game canvas not found');

  const query = new URLSearchParams(window.location.search);
  const debugEnabled = query.get('debug') === '1';

  let params: GameParams = debugEnabled
    ? loadStoredParams(structuredClone(defaultParams))
    : structuredClone(defaultParams);

  const surface = createCanvasSurface(canvas, params.layout.maxDpr);
  const renderer = createRenderer(surface);

  let layout: Layout = computeLayout(surface.width, surface.height, params.layout);
  let seed = initialSeed(query);
  let rng: Rng = createRng(seed);
  let board: BoardState = createInitialBoard(rng, params, layout);
  let physics: PhysicsWorld = createPhysicsWorld(layout, params);

  let phase: Phase = 'title';
  let turn: TurnResult | null = null;
  let resolveStartedAt = 0;
  let flyingStartedAt = 0;
  let waitingX = layout.logicalWidth / 2;
  let bestScore = readBestScore();
  let lostWarning = false;
  let debugPanel: DebugPanel | null = null;

  const waitingRadius = (): number => params.card.thrownRadius;

  const clampWaitingX = (x: number): number =>
    clamp(
      x,
      params.layout.edgeMargin + waitingRadius(),
      layout.logicalWidth - params.layout.edgeMargin - waitingRadius(),
    );

  function startGame(nextSeed: number = seed): void {
    seed = nextSeed;
    rng = createRng(seed);
    layout = computeLayout(surface.width, surface.height, params.layout);
    board = createInitialBoard(rng, params, layout);
    physics.dispose();
    physics = createPhysicsWorld(layout, params);
    physics.sync(board);
    phase = 'ready';
    turn = null;
    lostWarning = false;
    waitingX = layout.logicalWidth / 2;
    debugPanel?.setSeed(seed);
    pointer.setLayout(layout);
  }

  function launch(velocity: Vec2): void {
    const id = board.nextId;
    board = {
      ...board,
      thrown: [
        ...board.thrown,
        {
          id,
          pos: { x: waitingX, y: layout.launchY },
          velocity: { x: 0, y: 0 },
          radius: waitingRadius(),
        },
      ],
      hand: board.hand - 1,
      nextId: id + 1,
    };
    physics.sync(board);
    physics.launch(id, velocity);
    phase = 'flying';
    flyingStartedAt = performance.now();
    lostWarning = false;
  }

  const pointer = createPointerInput(canvas, layout, params.flick.maxHistory, {
    onDown(pos) {
      if (phase === 'title') {
        // 画面のどこをタップしても開始する。?seed= があればそれを使う。
        startGame();
        return false;
      }
      if (phase === 'gameover') {
        const rect = renderer.getRetryRect();
        if (rect) {
          const sx = pos.x * layout.scale + layout.offsetX;
          const sy = pos.y * layout.scale + layout.offsetY;
          if (sx >= rect.x && sx <= rect.x + rect.w && sy >= rect.y && sy <= rect.y + rect.h) {
            startGame(Date.now() >>> 0);
          }
        }
        return false;
      }
      if (phase !== 'ready') return false;
      if (board.hand <= 0) return false;
      if (pos.y < layout.launchZoneTop) return false;

      // 触れた X にカードがスナップする。Y は射出ライン固定。
      waitingX = clampWaitingX(pos.x);
      phase = 'aiming';
      return true;
    },

    onUp(history, upTimeMs) {
      if (phase !== 'aiming') return;
      const samples = history.recent(upTimeMs, params.flick.inputSampleWindowMs);
      const estimate: FlickEstimate | null = estimateLaunchVelocity(samples, params.flick);
      debugPanel?.showEstimate(estimate);

      if (!estimate) {
        // 投擲不成立。手札は減らさない。
        phase = 'ready';
        return;
      }
      launch(estimate.velocity);
    },

    onCancel() {
      if (phase === 'aiming') phase = 'ready';
    },
  });

  if (debugEnabled) {
    debugPanel = createDebugPanel(params, {
      onChange(next) {
        params = next;
        physics.applyParams(params);
      },
      onReseed() {
        startGame(Date.now() >>> 0);
      },
    });
    debugPanel.setSeed(seed);
  }

  physics.sync(board);

  function handleResize(): void {
    if (!surface.resize()) return;
    layout = computeLayout(surface.width, surface.height, params.layout);
    pointer.setLayout(layout);
    waitingX = clampWaitingX(waitingX);
  }

  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', handleResize);

  let last = performance.now();

  function frame(now: number): void {
    const elapsed = Math.min(now - last, MAX_FRAME_MS);
    last = now;

    handleResize();

    if (phase === 'ready' || phase === 'aiming' || phase === 'flying') {
      physics.step(elapsed);
      board = physics.readBack(board);

      const lost = physics.takeLostIds();
      if (lost.length > 0) {
        const lostSet = new Set(lost);
        board = { ...board, thrown: board.thrown.filter((t) => !lostSet.has(t.id)) };
        lostWarning = true;
      }

      if (phase === 'flying') {
        const timedOut = now - flyingStartedAt >= params.settle.settleTimeoutMs;
        if (timedOut && !physics.isSettled()) {
          console.warn('[settle] timeout reached; forcing stop');
        }
        if (physics.isSettled() || timedOut) {
          physics.freeze();
          board = physics.readBack(board);
          turn = resolveTurn(board, rng, params, layout);
          board = turn.nextBoard;
          physics.sync(board);
          physics.resetSettle();
          phase = 'resolving';
          resolveStartedAt = now;

          if (turn.isGameOver && board.score > bestScore) {
            bestScore = board.score;
            writeBestScore(bestScore);
          }
        }
      }
    }

    let resolveProgress = 0;
    if (phase === 'resolving') {
      resolveProgress = (now - resolveStartedAt) / params.settle.resolveDisplayMs;
      if (resolveProgress >= 1) {
        phase = turn?.isGameOver ? 'gameover' : 'ready';
        resolveProgress = 1;
      }
    }

    renderer.draw({
      board,
      phase,
      layout,
      turn: phase === 'resolving' ? turn : null,
      resolveProgress,
      waitingPos:
        (phase === 'ready' || phase === 'aiming') && board.hand > 0
          ? { x: waitingX, y: layout.launchY }
          : null,
      waitingRadius: waitingRadius(),
      bestScore,
      handCapacity: params.rule.initialHand,
      lostWarning,
      nowMs: now,
    });

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  // ここまで到達したら起動は成功。起動失敗時のメッセージを隠す。
  document.body.classList.add('booted');
}

main();
