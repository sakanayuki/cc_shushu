# 03. アーキテクチャ

## 3.1 レイヤ構成

最重要の設計方針は **`core` が外部ライブラリにもブラウザAPIにも一切依存しないこと**である。これにより判定ロジック全体が純粋関数としてテスト可能になり（[11-testing.md](./11-testing.md)）、将来 Matter.js を差し替えてもゲームルールは無傷で残る。

```text
┌─────────────────────────────────────────────────┐
│ main.ts            起動・RAFループ・状態機械の駆動       │
└───────┬─────────────────────────────────────────┘
        │
   ┌────┴────┬──────────┬──────────┬──────────┐
   ▼         ▼          ▼          ▼          ▼
┌──────┐ ┌───────┐ ┌────────┐ ┌────────┐ ┌──────┐
│input │ │physics│ │ render │ │   ui   │ │config│
└───┬──┘ └───┬───┘ └───┬────┘ └───┬────┘ └───┬──┘
    │        │         │          │          │
    └────────┴─────────┴──────────┴──────────┘
                       │
                       ▼
              ┌─────────────────┐
              │      core       │  ← 依存ゼロ。純粋関数のみ
              │  型・幾何・判定    │
              │  配置・乱数・状態  │
              └─────────────────┘
```

### 依存ルール

| レイヤ | 依存してよいもの | 依存してはいけないもの |
|---|---|---|
| `core` | `config` の型のみ | Matter.js、DOM、Canvas、`window`、`Math.random`、`Date.now` |
| `physics` | `core`、`config`、Matter.js | DOM、Canvas |
| `input` | `core`、`config`、Pointer Events | Matter.js、Canvas |
| `render` | `core`、`config`、Canvas 2D | Matter.js、DOM操作（Canvas以外） |
| `ui` | `core`、`config`、DOM | Matter.js、Canvas |
| `main` | すべて | — |

`core` が `Math.random` を禁止されている点は重要である。乱数は必ず `core/rng.ts` のシード付き擬似乱数を引数として受け取る（[07-board.md](./07-board.md)）。`Date.now` も同様に、時刻は引数で渡す。

## 3.2 ディレクトリ構成

```text
cc_shushu/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── eslint.config.js
├── vitest.config.ts
├── .github/
│   └── workflows/
│       └── deploy.yml
├── docs/                       ← 本設計書
└── src/
    ├── main.ts                 起動・RAFループ・状態機械
    ├── config/
    │   ├── params.ts           全チューニングパラメータの既定値
    │   ├── params.types.ts     パラメータの型定義
    │   └── layout.ts           盤面レイアウト定数の算出
    ├── core/
    │   ├── types.ts            ドメイン型（Card, BoardState, …）
    │   ├── rng.ts              xorshift32 シード付き擬似乱数
    │   ├── geometry.ts         円-円レンズ面積、距離、クランプ
    │   ├── coords.ts           論理座標 ↔ 画面座標の変換
    │   ├── flick.ts            PointerMove 履歴 → 初速ベクトル
    │   ├── resolve.ts          決着処理（判定[1]〜[6]）
    │   ├── board.ts            置きカードの生成・補充
    │   └── machine.ts          状態機械の遷移関数
    ├── physics/
    │   ├── world.ts            Matter.js の Engine / 壁の構築
    │   ├── bodies.ts           カード ↔ Matter.Body の変換
    │   ├── stepper.ts          固定タイムステップ・アキュムレータ
    │   └── settle.ts           停止判定
    ├── input/
    │   ├── pointer.ts          Pointer Events の購読と履歴記録
    │   └── history.ts          サンプル履歴リングバッファ
    ├── render/
    │   ├── canvas.ts           Canvas 初期化・DPR・リサイズ
    │   ├── renderer.ts         フレーム描画のオーケストレーション
    │   ├── theme.ts            色・線幅・フォント等の値（★差し替え層1）
    │   └── skins/
    │       ├── types.ts        CardSkin インターフェース（★差し替え層2）
    │       └── defaultSkin.ts  既定のカード描画実装
    └── ui/
        ├── hud.ts              手札枚数・累計得点
        ├── result.ts           リザルト画面・Retry
        └── debugPanel.ts       デバッグ調整UI（?debug=1）
```

## 3.3 ドメイン型定義

`src/core/types.ts`。実装はこの定義から始める。

```ts
/** 論理座標系上の点。単位は論理px（05章参照） */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** 難易度帯 */
export type Difficulty = 'easy' | 'normal' | 'hard';

/** 盤面に置かれた得点対象のカード。静的センサーで、動かない */
export interface PlacedCard {
  readonly id: number;
  readonly pos: Vec2;
  readonly radius: number;
  /** 難易度帯内でランダムに決定された得点（整数） */
  readonly score: number;
  readonly difficulty: Difficulty;
  /** どの難易度スロットに属するか。獲得時にこのスロットが補充対象になる */
  readonly slotIndex: number;
}

/** プレイヤーが投げたカード。物理ボディで、投げカード同士は衝突する */
export interface ThrownCard {
  readonly id: number;
  readonly pos: Vec2;
  readonly velocity: Vec2;
  readonly radius: number;
}

/** 盤面の全状態。これ以外にゲームの状態は存在しない */
export interface BoardState {
  readonly placed: readonly PlacedCard[];
  readonly thrown: readonly ThrownCard[];
  /** まだ投げていない手札の枚数 */
  readonly hand: number;
  readonly score: number;
  /** 次に採番するID */
  readonly nextId: number;
}

/** 1枚の置きカードに対する被覆の計算結果 */
export interface CoverageResult {
  readonly placedId: number;
  /** 重なり面積の合計 ÷ 置きカードの面積。0〜1にクランプ済み */
  readonly coverage: number;
  /** 重なっていた投げカードのID。面積0の接触は含まない */
  readonly coveringThrownIds: readonly number[];
  readonly captured: boolean;
}

/** 決着処理の結果。UIの表示と次フレームの盤面の両方をここから得る */
export interface TurnResult {
  readonly nextBoard: BoardState;
  /** 全置きカードの被覆率。未獲得のものも含む（被覆率表示に使う） */
  readonly coverages: readonly CoverageResult[];
  readonly capturedCards: readonly PlacedCard[];
  /** 手札に戻った投げカードのID */
  readonly collectedThrownIds: readonly number[];
  /** 空振りで失われた投げカードのID */
  readonly whiffedThrownIds: readonly number[];
  readonly gainedScore: number;
  readonly isGameOver: boolean;
}

/** ゲーム状態機械の状態 */
export type Phase =
  | 'boot'
  | 'ready'
  | 'aiming'
  | 'flying'
  | 'resolving'
  | 'gameover';
```

## 3.4 主要関数のシグネチャ

すべて純粋関数（`core`）。副作用を持たず、同じ入力に対して必ず同じ出力を返す。

```ts
// core/geometry.ts
/** 2つの円の重なり面積（レンズ面積）を解析的に求める */
export function circleOverlapArea(
  c1: Vec2, r1: number, c2: Vec2, r2: number
): number;

// core/rng.ts
export interface Rng {
  /** [0, 1) の乱数 */
  next(): number;
  /** [min, max) の乱数 */
  range(min: number, max: number): number;
  /** [min, max] の整数乱数 */
  int(min: number, max: number): number;
  /** 現在の内部状態（再現用） */
  getState(): number;
}
export function createRng(seed: number): Rng;

// core/flick.ts
export interface PointerSample {
  readonly t: number;  // ms
  readonly x: number;  // 論理座標
  readonly y: number;
}
/** 履歴から初速ベクトルを推定する。成立しない場合は null */
export function estimateLaunchVelocity(
  samples: readonly PointerSample[],
  params: FlickParams
): Vec2 | null;

// core/resolve.ts
/** 全カード停止後の盤面から、次の盤面と表示情報を導出する */
export function resolveTurn(
  board: BoardState,
  rng: Rng,
  params: GameParams,
  layout: Layout
): TurnResult;

// core/board.ts
/** ゲーム開始時の置きカード5枚を生成する */
export function createInitialBoard(
  rng: Rng, params: GameParams, layout: Layout
): BoardState;
/** 空いたスロットに置きカードを1枚補充する。置けない場合は null */
export function refillSlot(
  board: BoardState, slotIndex: number,
  rng: Rng, params: GameParams, layout: Layout
): PlacedCard | null;

// core/coords.ts
export interface Layout {
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly launchY: number;
  readonly launchZoneTop: number;
  readonly placedAreaTop: number;
  readonly placedAreaBottom: number;
  /** 論理→画面のスケール係数 */
  readonly scale: number;
  /** レターボックスのオフセット（画面px） */
  readonly offsetX: number;
  readonly offsetY: number;
}
export function computeLayout(
  viewportWidth: number, viewportHeight: number, params: GameParams
): Layout;
export function screenToLogical(p: Vec2, layout: Layout): Vec2;
export function logicalToScreen(p: Vec2, layout: Layout): Vec2;
```

## 3.5 `core` と `physics` の境界

`physics` レイヤは「`BoardState` を受け取って Matter.js の世界を同期し、1ステップ進めて、結果を `BoardState` として返す」だけの変換器に徹する。ゲームルールの判断は一切行わない。

```ts
// physics/world.ts
export interface PhysicsWorld {
  /** BoardState の thrown を Matter の Body 群に同期する（追加・削除・位置反映） */
  sync(board: BoardState): void;
  /** 指定IDのカードに初速を与える */
  launch(cardId: number, velocity: Vec2): void;
  /** 固定タイムステップで dtMs 分進める */
  step(dtMs: number): void;
  /** 現在の Body 群から thrown 配列を再構築して返す */
  readBack(board: BoardState): BoardState;
  /** ロストした（上端を越えた）カードのIDを返す */
  takeLostIds(): number[];
  /** 全カードが停止条件を満たしているか */
  isSettled(): boolean;
  dispose(): void;
}
export function createPhysicsWorld(
  layout: Layout, params: GameParams
): PhysicsWorld;
```

置きカードは静的センサーなので物理的な相互作用を持たないが、**描画順の管理と被覆計算のために `BoardState` 側でのみ保持する**。Matter.js の世界には登録しない（登録する必要がない）。これにより物理世界のボディ数が最小化され、`sync` も単純になる。

## 3.6 メインループ

```ts
// main.ts（骨格）
let last = performance.now();

function frame(now: number): void {
  const elapsed = Math.min(now - last, MAX_FRAME_MS);
  last = now;

  switch (phase) {
    case 'ready':
    case 'aiming':
    case 'flying':
      physics.step(elapsed);
      board = physics.readBack(board);
      board = removeLostCards(board, physics.takeLostIds());
      if (phase === 'flying' && (physics.isSettled() || settleTimedOut())) {
        turnResult = resolveTurn(board, rng, params, layout);
        board = turnResult.nextBoard;
        physics.sync(board);
        phase = 'resolving';
        resolveStartedAt = now;
      }
      break;

    case 'resolving':
      if (now - resolveStartedAt >= params.resolveDisplayMs) {
        phase = turnResult.isGameOver ? 'gameover' : 'ready';
      }
      break;
  }

  renderer.draw(board, phase, turnResult, layout);
  requestAnimationFrame(frame);
}
```

物理更新は固定タイムステップのアキュムレータ方式（[05-physics.md](./05-physics.md)）で行い、描画フレームレートに依存させない。これが原文 §2「同じ入力には可能な限り同じ結果を返す」の実装上の担保になる。
