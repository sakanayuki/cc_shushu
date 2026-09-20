import Matter from 'matter-js';
import type { GameParams } from '../config/params.types';
import type { Layout } from '../core/coords';
import type { BoardState, ThrownCard, Vec2 } from '../core/types';
import { createThrownBody, createWalls, parseThrownId } from './bodies';
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
  /** 上端を越えて失われたカードのIDを返す（同時に世界から除去する） */
  takeLostIds(): number[];
  isSettled(): boolean;
  /** 全カードの速度を0へ丸める */
  freeze(): void;
  resetSettle(): void;
  /** 物理パラメータの実行時変更を既存ボディへ反映する */
  applyParams(p: GameParams): void;
  dispose(): void;
}

function setZero(b: Matter.Body): void {
  Matter.Body.setVelocity(b, { x: 0, y: 0 });
  Matter.Body.setAngularVelocity(b, 0);
}

export function createPhysicsWorld(layout: Layout, params: GameParams): PhysicsWorld {
  let p = params;

  const engine = Matter.Engine.create({
    gravity: { x: 0, y: 0, scale: 0 },
    // スリープ判定は Matter に任せず自前で行う（後続の衝突に反応しなくなる事故を避ける）
    enableSleeping: false,
    positionIterations: p.physics.positionIterations,
    velocityIterations: p.physics.velocityIterations,
  });

  const walls = createWalls(layout, p);
  Matter.Composite.add(engine.world, walls);

  const bodies = new Map<number, Matter.Body>();
  const settler: Settler = createSettler(p.settle, setZero);

  const stepper = createStepper((dt) => {
    Matter.Engine.update(engine, dt);
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
        const body = createThrownBody(t.id, t.pos, t.radius, p);
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
        // 中心が上端を越えたら場外。全投げカードに共通して適用される。
        if (body.position.y < 0) {
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
      engine.positionIterations = next.physics.positionIterations;
      engine.velocityIterations = next.physics.velocityIterations;
      for (const body of bodies.values()) {
        body.frictionAir = next.physics.frictionAir;
        body.friction = next.physics.friction;
        body.frictionStatic = next.physics.frictionStatic;
        body.restitution = next.physics.restitution;
      }
      for (const wall of walls) {
        wall.restitution = next.physics.wallRestitution;
      }
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
