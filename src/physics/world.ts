import Matter from 'matter-js';
import type { GameParams } from '../config/params.types';
import type { Layout } from '../core/coords';
import type { BoardState, ThrownCard, Vec2 } from '../core/types';
import { createThrownBody, parseThrownId } from './bodies';
import { createSettler, type Settler } from './settle';
import { createStepper } from './stepper';

export interface PhysicsWorld {
  /** BoardState.thrown と Matter のボディ群を同期する（追加・削除のみ） */
  sync(board: BoardState): void;
  /** 指定IDのカードに初速を与える */
  launch(cardId: number, velocity: Vec2): void;
  /** 固定タイムステップで elapsedMs 分進める */
  step(elapsedMs: number): void;
  /** 現在のボディ群から thrown 配列を再構築する */
  readBack(board: BoardState): BoardState;
  /** 盤面外へ出て失われたカードのIDを返す（同時に世界から除去する） */
  takeLostIds(): number[];
  isSettled(): boolean;
  /** 全カードの速度を0へ丸める */
  freeze(): void;
  resetSettle(): void;
  /** 物理パラメータの実行時変更を反映する */
  applyParams(p: GameParams): void;
  dispose(): void;
}

function setZero(b: Matter.Body): void {
  Matter.Body.setVelocity(b, { x: 0, y: 0 });
  Matter.Body.setAngularVelocity(b, 0);
}

/**
 * 等加速度減速を1ステップ分適用する。
 *
 * 速度の大きさから linearDecel を引き、0 を下回ったら厳密に停止させる。
 * 指数減衰と違って有限時間で完全に止まるため、末尾でカードがじりじり滑り続けない。
 * 床の上を滑らせた物体の挙動に対応する。
 */
function applyDeceleration(body: Matter.Body, decel: number, drag: number): void {
  const vx = body.velocity.x;
  const vy = body.velocity.y;
  const speed = Math.hypot(vx, vy);
  if (speed === 0) return;

  const dragged = drag > 0 ? speed * (1 - drag) : speed;
  const next = dragged - decel;

  if (next <= 0) {
    setZero(body);
    return;
  }
  const k = next / speed;
  Matter.Body.setVelocity(body, { x: vx * k, y: vy * k });
}

export function createPhysicsWorld(layout: Layout, params: GameParams): PhysicsWorld {
  let p = params;

  // 衝突が存在しないため、反復回数は最小でよい。
  const engine = Matter.Engine.create({
    gravity: { x: 0, y: 0, scale: 0 },
    enableSleeping: false,
    positionIterations: 1,
    velocityIterations: 1,
  });

  // 壁は置かない。盤面の四辺はすべて場外であり、出たカードは失われる。
  const bodies = new Map<number, Matter.Body>();
  const settler: Settler = createSettler(p.settle, setZero);

  const stepper = createStepper((dt) => {
    Matter.Engine.update(engine, dt);
    for (const body of bodies.values()) {
      applyDeceleration(body, p.physics.linearDecel, p.physics.drag);
    }
    settler.update([...bodies.values()], dt);
  });

  return {
    sync(board) {
      const wanted = new Set(board.thrown.map((t) => t.id));

      for (const [id, body] of bodies) {
        if (!wanted.has(id)) {
          Matter.Composite.remove(engine.world, body);
          bodies.delete(id);
        }
      }

      for (const t of board.thrown) {
        if (bodies.has(t.id)) continue;
        const body = createThrownBody(t.id, t.pos, t.radius);
        bodies.set(t.id, body);
        Matter.Composite.add(engine.world, body);
      }
    },

    launch(cardId, velocity) {
      const body = bodies.get(cardId);
      if (!body) return;
      Matter.Body.setVelocity(body, { x: velocity.x, y: velocity.y });
      settler.reset();
    },

    step(elapsedMs) {
      stepper(elapsedMs);
    },

    readBack(board) {
      const thrown: ThrownCard[] = [];
      for (const t of board.thrown) {
        const body = bodies.get(t.id);
        if (!body) continue;
        thrown.push({
          id: t.id,
          radius: t.radius,
          pos: { x: body.position.x, y: body.position.y },
          velocity: { x: body.velocity.x, y: body.velocity.y },
        });
      }
      return { ...board, thrown };
    },

    takeLostIds() {
      const lost: number[] = [];
      for (const [id, body] of bodies) {
        // 中心が盤面の外へ出たら場外。四辺すべてに等しく適用される。
        const { x, y } = body.position;
        if (x < 0 || x > layout.logicalWidth || y < 0 || y > layout.logicalHeight) {
          lost.push(id);
          Matter.Composite.remove(engine.world, body);
          bodies.delete(id);
        }
      }
      return lost;
    },

    isSettled() {
      return settler.isSettled();
    },

    freeze() {
      settler.freeze([...bodies.values()]);
    },

    resetSettle() {
      settler.reset();
    },

    applyParams(next) {
      p = next;
    },

    dispose() {
      for (const body of bodies.values()) Matter.Composite.remove(engine.world, body);
      bodies.clear();
      Matter.Composite.clear(engine.world, false);
      Matter.Engine.clear(engine);
    },
  };
}

export { parseThrownId };
