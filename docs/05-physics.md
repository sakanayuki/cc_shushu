# 05. 座標系と物理

## 5.1 論理座標系

CSSピクセルをそのままゲーム物理の基準にしない。論理座標系を定義し、端末の表示領域へスケーリングする。

```text
LOGICAL_WIDTH  = 1000                                    （固定）
LOGICAL_HEIGHT = clamp(1000 × vh / vw, 1600, 2100)       （可変＋クランプ）
```

| 端末 | アスペクト比 | 1000×vh/vw | 論理高さ | 表示 |
|---|---|---:|---:|---|
| iPhone SE (375×667) | 1:1.78 | 1779 | 1779 | 全画面 |
| iPhone 15 (393×852) | 1:2.17 | 2168 | **2100** | 上下にレターボックス |
| Pixel 8 (412×915) | 1:2.22 | 2221 | **2100** | 上下にレターボックス |
| iPad 縦 (820×1180) | 1:1.44 | 1439 | **1600** | 左右にレターボックス |

### クランプする根拠

論理高さを完全にアスペクト比追従にすると、盤面の縦の長さが端末間で最大30%以上変わり、「この距離ならこの強さ」という学習が端末をまたいで移らない。逆に完全固定にすると縦長端末で常に黒帯が出る。

クランプ方式は、**実機の大半（1.78〜2.1）でレターボックスなし**、かつ**飛距離の体感差を有界**に保つ。原文 §14 の意図（体感が端末サイズによって大きく変わらないようにする）を、見た目を犠牲にせず満たす。

### 座標変換

```ts
// core/coords.ts
scale   = min(viewportWidth / LOGICAL_WIDTH, viewportHeight / logicalHeight)
offsetX = (viewportWidth  - LOGICAL_WIDTH  × scale) / 2
offsetY = (viewportHeight - logicalHeight × scale) / 2

logicalToScreen(p) = { x: p.x × scale + offsetX, y: p.y × scale + offsetY }
screenToLogical(p) = { x: (p.x - offsetX) / scale, y: (p.y - offsetY) / scale }
```

この2関数が互いに逆関数であることは単体テストで検証する（[11-testing.md](./11-testing.md)）。

### DPR の扱い

Canvas のバッキングストアは `devicePixelRatio`（上限2にクランプ）を掛けたサイズで確保し、コンテキストに `ctx.scale(dpr, dpr)` を適用する。したがって**描画コードは DPR を意識しない**。入力座標も `clientX/clientY`（CSS px）から直接論理座標へ変換するため、DPR は入力にも現れない。

上限2にクランプするのは、DPR 3 の端末でバッキングストアが9倍の面積になり、低スペック機で描画が破綻するのを防ぐため。

## 5.2 盤面レイアウト

論理高さ `H` に対して、以下のように領域を定義する。**すべて `H` からの相対で定義し、論理高さの変動に追従させる**。

```text
y = 0                       ─── ロストライン（これを越えた投げカードは失われる）
      ↕ LOST_CLEARANCE = 180
y = placedAreaTop           ─── 置きカード配置可能域の上端
      ↕
      ↕                        置きカード配置可能域
      ↕
y = placedAreaBottom        ─── 置きカード配置可能域の下端
      ↕ LAUNCH_CLEARANCE = 220
y = launchZoneTop           ─── 射出領域の上端（タッチ受理範囲の上端）
      ↕
y = launchY                 ─── 射出ライン（投げカードの中心Y）
      ↕
y = H                       ─── 盤面下端（壁）
```

```ts
// config/layout.ts
const H = logicalHeight;
launchY          = H - 190;
launchZoneTop    = H - 420;
placedAreaBottom = launchZoneTop - 220;   // = H - 640
placedAreaTop    = 180;
```

| 定数 | 初期値 | 根拠 |
|---|---:|---|
| `LOST_CLEARANCE` | 180 | 置きカードがロストラインに近すぎると、狙った瞬間に場外へ抜けるリスクが高すぎる |
| `LAUNCH_CLEARANCE` | 220 | 射出直後の位置に置きカードがあると、フリックせずタップだけで取れてしまう |
| `EDGE_MARGIN` | 60 | 置きカード中心が盤面端から最低限離れる距離（原文 §6「画面端から安全マージンを確保する」） |

射出ラインの X 範囲は `[EDGE_MARGIN + THROWN_RADIUS, LOGICAL_WIDTH - EDGE_MARGIN - THROWN_RADIUS]` にクランプする。

## 5.3 Matter.js の設定

### エンジン

```ts
const engine = Matter.Engine.create({
  gravity: { x: 0, y: 0, scale: 0 },   // トップダウン視点なので重力なし
  enableSleeping: false,               // 停止判定は自前で行う（5.5節）
  positionIterations: 8,
  velocityIterations: 6,
});
```

`enableSleeping: false` とするのは、Matter.js のスリープ判定が本作の停止条件（5.5節）と一致せず、スリープしたボディが後続の衝突に正しく反応しない事故を避けるため。停止判定は完全に自前で行う。

### 投げカード（物理ボディ）

```ts
Matter.Bodies.circle(x, y, THROWN_RADIUS, {
  label: `thrown:${id}`,
  friction: 0,              // 面摩擦は使わない（5.4節）
  frictionStatic: 0,
  frictionAir: FRICTION_AIR,
  restitution: RESTITUTION,
  density: DENSITY,
  slop: 0.02,
});
```

### 置きカード

**Matter.js の世界には登録しない。** `BoardState.placed` としてのみ保持する。

置きカードは静的センサー相当の扱いであり、物理的な相互作用を一切持たない。Matter.js に `isStatic: true, isSensor: true` のボディとして登録することも可能だが、衝突イベントも力の伝播も不要なため、登録しないほうが単純かつ高速である。被覆判定は `core/geometry.ts` の純粋関数が `BoardState` に対して直接行う。

### なぜ置きカードは衝突しないのか

**これは技術的必然である。** Matter.js は2D剛体物理エンジンであり、衝突する2つの剛体は原理的に重なれない。一方、本作の獲得条件「面積の過半数を覆う」は重なりを前提としている。したがって、置きカードを通常の剛体にすると獲得が永久に不可能になる。

原文 §9 が意図した「カード同士の物理干渉」は、**投げカード同士の衝突**として完全に維持される。むしろ「盤面に残った自分の掠りカードを押して、置きカードへの被覆を50%超へ押し上げる」という形で、干渉が得点に直結する設計になっている。

### 壁

| 辺 | 種別 | 反発 |
|---|---|---|
| 左 | 静的な矩形ボディ | `WALL_RESTITUTION` |
| 右 | 静的な矩形ボディ | `WALL_RESTITUTION` |
| 下 | 静的な矩形ボディ | `WALL_RESTITUTION` |
| 上 | **なし**（場外） | — |

壁の厚みは 200 とし、盤面の外側に配置する（高速なカードが薄い壁をすり抜けるのを防ぐ）。

## 5.4 減速モデル

**面摩擦（`friction`）を 0 とし、減速はすべて `frictionAir` で表現する。**

Matter.js の `frictionAir` は毎ステップ速度に `(1 - frictionAir)` を乗じる指数減衰であり、以下の性質を持つ。

```text
v(n) = v0 × (1 - frictionAir)^n
総移動距離 ≈ v0 / frictionAir
```

| 性質 | 意味 |
|---|---|
| 総移動距離が初速に**比例** | 「2倍の強さで振れば約2倍飛ぶ」が成立し、原文 §2 の学習可能性に直結する |
| 停止が漸近的 | 厳密には止まらないため、自前の停止判定（5.5節）が必須になる |
| 決定論的 | 接触状態に依存しないため、同じ初速なら必ず同じ距離で止まる |

面摩擦を使う（クーロン摩擦的な一定減速）と総移動距離が初速の2乗に比例し、弱い入力の解像度が極端に低くなる。本作の「狙った位置で止める」という中心体験には指数減衰のほうが適している。

| パラメータ | 初期値 | 効果 |
|---|---:|---|
| `FRICTION_AIR` | 0.028 | 初速 50 で約1800論理px 進む。盤面をちょうど縦断する強さ |
| `RESTITUTION` | 0.35 | 投げカード同士の反発。「コツン」と当たって双方が動く手応え |
| `WALL_RESTITUTION` | 0.20 | 壁での跳ね返り。弱く跳ね返って壁際で死ぬ |
| `DENSITY` | 0.002 | 質量 = π r² × density。全カード同質量なので衝突は対称 |

## 5.5 停止判定

Matter.js 上で微小速度が残り続けてゲーム進行が止まらないよう、独自の停止条件を設ける。

```text
すべての投げカードについて
    speed < STOP_SPEED
    AND
    angularSpeed < STOP_ANGULAR_SPEED
が STOP_DURATION_MS 以上継続したら「停止」とみなす
```

停止が確定したら、**全カードの速度と角速度を明示的に 0 へ丸める**。これにより次の投擲開始時の盤面が完全に確定し、判定処理（[06-scoring.md](./06-scoring.md)）の再現性が保証される。

```ts
// physics/settle.ts
interface Settler {
  /** 毎ステップ呼ぶ。条件を満たし続けた時間を内部で累積する */
  update(bodies: readonly Matter.Body[], dtMs: number): void;
  isSettled(): boolean;
  /** 停止確定時に速度を0へ丸める */
  freeze(bodies: readonly Matter.Body[]): void;
  reset(): void;
}
```

| パラメータ | 初期値 | 単位 |
|---|---:|---|
| `STOP_SPEED` | 0.35 | 論理px/step |
| `STOP_ANGULAR_SPEED` | 0.02 | rad/step |
| `STOP_DURATION_MS` | 180 | ms |
| `SETTLE_TIMEOUT_MS` | 6000 | ms |

### タイムアウト

`FLYING` 状態が `SETTLE_TIMEOUT_MS` を超えた場合、停止条件の成立を待たずに強制的に `freeze()` して `RESOLVING` へ遷移する。

これは、壁際で微妙な力が釣り合い続けるなどの想定外の状況でゲームが永久に進行不能になることを防ぐフェイルセーフである。初期値 6000ms は、`FRICTION_AIR = 0.028` で最大初速 62 から `STOP_SPEED = 0.35` まで減衰する理論時間（約 `ln(0.35/62) / ln(1-0.028) × 16.67ms ≈ 3040ms`）の約2倍にあたり、通常のプレイでは到達しない。

**タイムアウトが発火した場合はコンソールに警告を出す。** PoC 段階でこれが頻発するなら、物理パラメータかスリープ設定に問題がある兆候である。

## 5.6 固定タイムステップ

描画フレームレートに物理挙動を依存させないため、アキュムレータ方式の固定タイムステップを用いる。

```ts
// physics/stepper.ts
const FIXED_DT = 1000 / 60;   // 16.667ms
const MAX_SUBSTEPS = 5;
let accumulator = 0;

function step(elapsedMs: number): void {
  accumulator += Math.min(elapsedMs, FIXED_DT * MAX_SUBSTEPS);
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
    Matter.Engine.update(engine, FIXED_DT);
    settler.update(bodies, FIXED_DT);
    accumulator -= FIXED_DT;
    steps++;
  }
}
```

| 項目 | 内容 |
|---|---|
| なぜ固定か | 可変デルタだと 60Hz 端末と 120Hz 端末で、同じ初速のカードが違う距離で止まる。原文 §2「同じ入力には可能な限り同じ結果を返す」に反する |
| `MAX_SUBSTEPS` の役割 | タブが非アクティブから復帰した際、巨大な `elapsed` で大量のステップが走って処理が固まる（いわゆる spiral of death）のを防ぐ |
| 余剰の扱い | `MAX_SUBSTEPS` を超えた分の時間は切り捨てる。実時間より物理時間が遅れるが、ゲーム性には影響しない |

補間描画は行わない。60Hz の物理更新をそのまま描画するため、120Hz 端末では同じフレームが2回描かれることがあるが、本作の視覚表現（単色の円が滑るだけ）では知覚されない。実装の単純さを優先する。

## 5.7 場外ロスト

```text
カード中心の y < 0 になった投げカードは、盤面から除去され失われる
```

中心基準（カードが完全に画面外に出るのを待たない）とするのは、判定を単純かつ予測可能にするため。プレイヤーから見ると「カードが上端を半分はみ出したら消える」という挙動になり、視覚的にも理解しやすい。

ロストは**全投げカードに共通して適用される**。自分が直接フリックしたカードだけでなく、衝突で押された既存の掠りカードも同様にロストする。これは原文 §9 の「特殊ルールではなく、全プレイヤー・全カードに共通する物理法則として扱う」という原則に沿う。結果として「高得点の置きカードの奥側を狙うと、掠りで残していたカードを押し出して失う」というリスク判断が生まれる。

置きカードは動かないため、ロストすることはない。

### ロストと判定処理の関係

ロストは物理更新のたびに即座に処理され（`physics.takeLostIds()`）、判定処理（[06-scoring.md](./06-scoring.md)）の時点では既に `BoardState.thrown` から除かれている。したがって判定処理はロストを意識しなくてよい。
