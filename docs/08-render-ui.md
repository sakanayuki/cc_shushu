# 08. 描画・テーマ・UI

## 8.1 描画方式

**Matter.js の組込み `Matter.Render` は使わない。自前の Canvas 2D レンダラを実装する。**

| 理由 | 内容 |
|---|---|
| 論理座標の制御 | 論理座標 → 画面座標のスケーリングとレターボックスを自前で管理する必要がある（[05-physics.md](./05-physics.md)） |
| 置きカードの描画 | 置きカードは Matter.js の世界に存在しないため、`Matter.Render` では描画できない |
| 得点・被覆率の表示 | カード上への数値表示は `Matter.Render` の守備範囲外 |
| デザイン差し替え | 決定25 のテーマ／スキン2層は、描画を自前で持っていて初めて成立する |

`Matter.Render` はデバッグ時にオーバーレイとして併用することは可能とする（`?debug=1` 時のみ）。

## 8.2 Canvas の初期化

```ts
// render/canvas.ts
function setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width  = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
```

- DPR は 2 にクランプする（DPR 3 の端末でバッキングストアが9倍になり低スペック機で破綻するのを防ぐ）
- `alpha: false` で背景の合成を省略し、描画コストを下げる
- `resize` と `orientationchange` で再初期化し、`computeLayout` を呼び直す

### タッチ挙動の抑止

```css
html, body { margin: 0; overscroll-behavior: none; }
canvas {
  display: block;
  width: 100vw;
  height: 100dvh;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}
```

`touch-action: none` は Pointer Events でフリックを取るために必須。`100dvh` はモバイルブラウザのアドレスバー伸縮に追従させるため。

## 8.3 描画順序

```text
[1] 背景（盤面全体の塗り）
[2] レターボックス領域（盤面外）の塗り
[3] 盤面の境界線（ロストライン・射出ライン）
[4] 置きカード（得点ラベル付き）
[5] 被覆率表示（RESOLVING 中のみ）
[6] 投げカード（掠り・飛行中）
[7] 待機中の投げカード（READY / AIMING 中）
[8] HUD（手札枚数・累計得点）
[9] リザルト（GAMEOVER 中のみ）
```

置きカードを投げカードより先に描くことで、**投げカードが置きカードの上に重なって見える**。これは「覆っている」というルールの視覚的な表現そのものであり、プレイヤーが被覆の程度を目視で判断する手がかりになる。

### ロストラインの視認性

盤面上端は場外であり、「ここを越えたら失う」ことが見えている必要がある。破線と警告色でロストラインを明示し、投げカードが近づいたときに強調する。これは演出ではなく、原文 §20「失敗理由を明確にする」のための機能である。

## 8.4 テーマ／スキンの2層構造

「カードのデザインを後から変更しやすく」という要求に対し、**値の層**と**描画の層**を分離する。

### 層1: `render/theme.ts` — 値

色・線幅・フォント・影など、見た目を決める値をすべてここに集約する。色を変えたいだけなら、このファイルの1行を書き換えれば済む。

```ts
// render/theme.ts
export interface Theme {
  readonly background: string;
  readonly outOfBounds: string;
  readonly lostLine: string;
  readonly launchLine: string;
  readonly placedCard: Record<Difficulty, {
    readonly fill: string;
    readonly stroke: string;
    readonly strokeWidth: number;
    readonly labelColor: string;
  }>;
  readonly thrownCard: {
    readonly fill: string;
    readonly stroke: string;
    readonly strokeWidth: number;
  };
  readonly waitingCard: { readonly fill: string; readonly stroke: string };
  readonly coverageLabel: {
    readonly captured: string;
    readonly near: string;     // 40%以上
    readonly far: string;      // 40%未満
  };
  readonly hud: { readonly text: string; readonly dim: string };
  readonly fontFamily: string;
}

export const defaultTheme: Theme = { /* … */ };
```

### 層2: `render/skins/` — 描画

形そのものを変えたい場合（円形メダル風、角丸矩形風の装飾、画像の貼り込みなど）は、スキンの実装を差し替える。

```ts
// render/skins/types.ts
export interface CardSkin {
  drawPlacedCard(
    ctx: CanvasRenderingContext2D,
    card: PlacedCard,
    theme: Theme,
    scale: number
  ): void;

  drawThrownCard(
    ctx: CanvasRenderingContext2D,
    card: ThrownCard,
    state: 'flying' | 'grazing' | 'waiting',
    theme: Theme,
    scale: number
  ): void;

  drawCoverageLabel(
    ctx: CanvasRenderingContext2D,
    card: PlacedCard,
    coverage: number,
    theme: Theme,
    scale: number
  ): void;
}
```

レンダラはこのインターフェースにのみ依存し、具体的な描画実装を知らない。

```ts
// render/renderer.ts
export function createRenderer(
  ctx: CanvasRenderingContext2D,
  theme: Theme = defaultTheme,
  skin: CardSkin = defaultSkin
): Renderer;
```

### この構造の最大の利点

**当たり判定（円）と描画が完全に分離されるため、見た目をどれだけ変えてもゲームバランスが1ミリも動かない。**

`PlacedCard.radius` は物理・判定のための値であり、スキンがそれをどう視覚化するかは自由である。角丸矩形として描いても、判定は円のままである。これにより「デザインを変えたらバランスが崩れた」という事故が原理的に起きない。

## 8.5 HUD とフィードバック

決定28 により、**機能的フィードバックのみ**を実装する。パーティクル、画面シェイク、コンボ表示などは入れない。

| 要素 | 内容 | 目的 |
|---|---|---|
| 手札枚数 | `●●●○○` のようなドット表示 | 残り投擲回数の把握 |
| 累計得点 | 数値 | 現在のスコア |
| 置きカードの得点 | カード中央に整数 | 狙う価値の判断 |
| **被覆率表示** | 停止直後、各置きカードの上に `48%` | **失敗理由の特定** |
| 獲得時の得点ポップ | `+80` が浮かび上がる | 何点入ったかの明示 |
| 回収アニメ | 獲得カードと投げカードが手札方向へ移動して消える | 「戻ってきた」ことの明示 |
| 空振りフェード | 空振りカードが薄くなって消える | 「失った」ことの明示 |
| リザルト | 最終得点・ベストスコア・Retry ボタン | ゲーム終了 |

### 被覆率表示が機能である理由

これは演出ではない。原文 §19 の確認項目「ミスした理由を理解できるか」に直接対応する。

「48%」と見えることで、プレイヤーは「あと少しだった」「もう1枚寄せれば取れた」「全然ダメだった」を区別でき、次のフリックを具体的に修正できる。数値がなければ、ミスの原因が強さなのか方向なのか位置なのか判別できず、上達の手がかりを失う。

表示色は被覆率で変える（獲得 / 40%以上 / 40%未満）。これは「惜しかったか否か」を一瞬で読み取れるようにするためである。

### アニメーションの実装方針

`RESOLVING` 状態の経過時間（`now - resolveStartedAt`）を `0〜1` に正規化した進捗値から、位置と不透明度を計算する。状態を持たない純粋な関数として実装し、途中でリサイズされても破綻しないようにする。

## 8.6 デバッグ調整UI

原文 §17 の「操作感の調整速度をコード編集速度に依存させない」を実現する。

### 方式

**自前の軽量パネル ＋ `?debug=1` で表示**。lil-gui などの外部ライブラリは使わない。

| 判断 | 根拠 |
|---|---|
| 自前実装 | lil-gui はデスクトップ前提で、スマホ実機ではスライダー操作が難しい。またゲーム本体の Pointer Events と競合しうる |
| `?debug=1` で有効化 | 本番ビルドに含めることで、**公開URLにスマホ実機からアクセスしてその場で調整できる**。これが §17 の本質である |
| 開発ビルド限定にしない | PC のマウス操作でしかチューニングできなくなる。本作は指の感覚が全てなので、この制約は致命的 |

### 機能

```text
┌──────────────────────────┐
│ ▼ FLICK                  │
│   FLICK_POWER      6.00  │ ━━━●━━━━━
│   MIN_FLICK_SPEED  8.00  │ ━●━━━━━━━
│   MAX_FLICK_SPEED 62.00  │ ━━━━━━●━━
│   SAMPLE_WINDOW      80  │ ━━━●━━━━━
│   PEAK_BLEND       0.35  │ ━━●━━━━━━
│ ▼ PHYSICS                │
│   FRICTION_AIR    0.028  │ ━━━●━━━━━
│   RESTITUTION      0.35  │ ━━━●━━━━━
│   ...                    │
│ ▼ LAST THROW             │
│   finger    3.42 px/ms   │
│   regress   2.98         │
│   peak      4.11         │
│   launch   21.6 (ok)     │
│ ▼ SEED                   │
│   seed  1737284923       │
│   [Copy URL] [Reseed]    │
│ ─────────────────────────│
│ [Copy JSON] [Reset]      │
└──────────────────────────┘
```

| 機能 | 内容 |
|---|---|
| スライダー | 全チューニングパラメータをリアルタイムに変更 |
| 直前の投擲の推定値 | 指の速度・回帰値・ピーク値・最終初速・**クランプされたか** |
| シード表示と操作 | 現在のシード、URLへのコピー、再抽選 |
| localStorage 永続 | 変更値を保存し、リロードしても維持される |
| **Copy JSON** | 現在の全パラメータをJSON形式でクリップボードへ。`config/params.ts` に貼り戻す |
| Reset | 既定値へ戻す |

### 「クランプされたか」の表示が重要な理由

チューニング中に `MAX_FLICK_SPEED` の上限に当たり続けていると、`FLICK_POWER` をいくら変えても結果が変わらない。この状況は数値を見ないと気づけず、何十分も無駄にしうる。`(ok)` / `(CLAMPED)` の表示ひとつでこれを防ぐ。

### 入力の分離

デバッグパネルは DOM 要素として Canvas の上にオーバーレイし、パネル上のポインタイベントは `stopPropagation()` してゲーム入力へ伝播させない。これによりスライダー操作が意図せぬ投擲を引き起こすことを防ぐ。

### パラメータの適用範囲

| パラメータ種別 | 変更の反映 |
|---|---|
| 入力系（FLICK_POWER 等） | 次の投擲から即座に反映 |
| 物理系（FRICTION_AIR 等） | 既存ボディのプロパティを更新して即座に反映 |
| レイアウト系（EDGE_MARGIN 等） | 次のゲーム（Retry）から反映 |
| 配置系（スロット定義等） | 次のゲーム（Retry）から反映 |

物理系を即座に反映させることが、チューニングのイテレーション速度を決める。`FRICTION_AIR` を動かしながら同じ盤面（同じシード）で投げ続けられる状態が理想である。
