# 11. テスト戦略

## 11.1 方針

**Vitest で、物理・描画・DOM に依存しない層のみをテストする。**

本作の価値の中心は「手触り」であり、それは自動テストできない（原文 §19 の評価基準は全て主観的である）。一方で、判定ロジックは**壊れても画面上では気づきにくい**。この非対称性に合わせ、テストの対象を絞る。

| 対象 | テスト | 理由 |
|---|---|---|
| `core/geometry.ts` | ○ | 数式を間違えても画面上は「なんとなく動いている」ように見える |
| `core/resolve.ts` | ○ | 6段階の状態遷移。順序ミスや重複加算が発生しやすい |
| `core/board.ts` | ○ | 制約違反の配置は稀にしか出ず、手動テストで見つからない |
| `core/flick.ts` | ○ | 回帰計算の誤りは「なんか飛ばない」としか見えない |
| `core/coords.ts` | ○ | 往復変換の不整合はレターボックス環境でのみ露呈する |
| `core/rng.ts` | ○ | 決定性が全テストの前提になる |
| `physics/*` | × | Matter.js の挙動を検証しても意味がない。実機で触って判断する |
| `render/*`、`ui/*` | × | 見た目は目で見る |

Playwright による E2E は**採用しない**。CI 時間と維持コストが増え、手触り調整のたびにテストが壊れやすい。PoC 段階では割に合わない。

## 11.2 `core/geometry.ts` — 円-円レンズ面積

境界値を網羅する。ここが最も「数式を間違えても気づかない」場所である。

```ts
describe('circleOverlapArea', () => {
  it('離れている円は0を返す', () => {
    expect(circleOverlapArea({x:0,y:0}, 10, {x:100,y:0}, 10)).toBe(0);
  });

  it('ちょうど外接する円は0を返す', () => {
    expect(circleOverlapArea({x:0,y:0}, 10, {x:20,y:0}, 10)).toBe(0);
  });

  it('中心が一致する同径の円は、その円の面積を返す', () => {
    expect(circleOverlapArea({x:0,y:0}, 10, {x:0,y:0}, 10))
      .toBeCloseTo(Math.PI * 100, 6);
  });

  it('小さい円が大きい円に完全に内包される場合、小さい円の面積を返す', () => {
    expect(circleOverlapArea({x:0,y:0}, 50, {x:5,y:0}, 10))
      .toBeCloseTo(Math.PI * 100, 6);
  });

  it('ちょうど内接する場合も内包として扱う', () => {
    expect(circleOverlapArea({x:0,y:0}, 50, {x:40,y:0}, 10))
      .toBeCloseTo(Math.PI * 100, 6);
  });

  it('同径の円が半径分ずれたとき、既知のレンズ面積と一致する', () => {
    // r=1, d=1 のレンズ面積 = 2π/3 - √3/2
    expect(circleOverlapArea({x:0,y:0}, 1, {x:1,y:0}, 1))
      .toBeCloseTo(2*Math.PI/3 - Math.sqrt(3)/2, 9);
  });

  it('交換法則が成り立つ', () => {
    const a = circleOverlapArea({x:0,y:0}, 13, {x:7,y:3}, 9);
    const b = circleOverlapArea({x:7,y:3}, 9, {x:0,y:0}, 13);
    expect(a).toBeCloseTo(b, 9);
  });

  it('いかなる入力でもNaNを返さない（丸め誤差の保護）', () => {
    const rng = createRng(42);
    for (let i = 0; i < 10000; i++) {
      const a = circleOverlapArea(
        { x: rng.range(-100,100), y: rng.range(-100,100) }, rng.range(1,50),
        { x: rng.range(-100,100), y: rng.range(-100,100) }, rng.range(1,50)
      );
      expect(Number.isFinite(a)).toBe(true);
      expect(a).toBeGreaterThanOrEqual(0);
    }
  });
});
```

最後の NaN テストが重要である。`Math.acos` の引数が丸め誤差で `±1` をわずかに超えたり、平方根の中身が負になったりすると `NaN` が返り、被覆率が `NaN` になって獲得判定が常に false になる。**画面上は「なぜか取れない」としか見えず、原因特定に時間がかかる類のバグ**である。

## 11.3 `core/resolve.ts` — 決着処理

盤面を直接構築し、遷移後の状態を検証する。物理を動かす必要はない。

```ts
describe('resolveTurn', () => {
  it('被覆率が50%を超えたカードを獲得する', () => { /* … */ });
  it('被覆率がちょうど50%のカードは獲得しない', () => { /* … */ });
  it('獲得したカードの得点が加算される', () => { /* … */ });
  it('獲得に寄与した投げカードが手札に戻る', () => { /* … */ });

  it('1枚が2つのカードを獲得させた場合、手札は1枚しか増えない', () => {
    // 最も事故りやすいケース。Set による重複排除を検証する
  });

  it('複数枚の面積合計で過半数に達した場合、全て回収される', () => { /* … */ });
  it('どのカードにも重ならない投げカードは除去され、手札に戻らない', () => { /* … */ });
  it('接するだけ（重なり面積0）の投げカードは空振り扱いになる', () => { /* … */ });
  it('掠り（重なるが未獲得）の投げカードは盤面に残る', () => { /* … */ });
  it('獲得されたスロットが同じ難易度で補充される', () => { /* … */ });
  it('手札が0になったらisGameOverがtrueになる', () => { /* … */ });
  it('未獲得カードの被覆率もcoveragesに含まれる', () => { /* … */ });
  it('入力のBoardStateを破壊しない（純粋性）', () => { /* … */ });
});
```

### 不変条件のプロパティテスト

[06-scoring.md](./06-scoring.md) 6.4節の不変条件を、ランダムな盤面で検証する。

```ts
it('カード総数は単調減少する', () => {
  const rng = createRng(1);
  for (let trial = 0; trial < 500; trial++) {
    const board = randomBoard(rng);
    const before = board.hand + board.thrown.length;
    const after = resolveTurn(board, rng, params, layout).nextBoard;
    const total = after.hand + after.thrown.length;
    expect(total).toBeLessThanOrEqual(before);
  }
});

it('手札が初期値を超えない', () => { /* … */ });
it('得点は減らない', () => { /* … */ });
it('置きカードは常に5枚以下', () => { /* … */ });
```

「カード総数が単調減少する」ことは、**ゲームが必ず終了する**ことの証明に相当する。これが壊れると無限にプレイできてしまうため、回帰テストとして価値が高い。

## 11.4 `core/board.ts` — 配置制約

シードを変えて数百回生成し、全制約を検証する。

```ts
describe('createInitialBoard', () => {
  it('あらゆるシードで全ての配置制約を満たす', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const board = createInitialBoard(createRng(seed), params, layout);
      for (const card of board.placed) {
        // C1: 端からのマージン
        expect(card.pos.x - card.radius).toBeGreaterThanOrEqual(params.edgeMargin);
        expect(card.pos.x + card.radius)
          .toBeLessThanOrEqual(layout.logicalWidth - params.edgeMargin);
        // C2: 配置可能域
        expect(card.pos.y - card.radius).toBeGreaterThanOrEqual(layout.placedAreaTop);
        expect(card.pos.y + card.radius).toBeLessThanOrEqual(layout.placedAreaBottom);
        // C3: カード同士の最小間隔
        for (const other of board.placed) {
          if (other.id === card.id) continue;
          const d = Math.hypot(other.pos.x - card.pos.x, other.pos.y - card.pos.y);
          expect(d).toBeGreaterThanOrEqual(card.radius + other.radius);
        }
      }
    }
  });

  it('難易度構成が常にEasy2/Normal2/Hard1になる', () => { /* … */ });
  it('得点が難易度帯の範囲内に収まる', () => { /* … */ });
  it('同じシードから必ず同じ盤面が生成される', () => { /* … */ });

  it('補充カードは既存の投げカードと重ならない', () => {
    // プレイヤーの入力なしに獲得が成立してしまう事故を防ぐ
  });

  it('射出領域に置きカードを配置しない', () => { /* … */ });
});
```

配置制約のテストは、**手動プレイでは数百回に1回しか露呈しない不具合**を確実に捕まえる。

## 11.5 `core/flick.ts` — 速度推定

```ts
describe('estimateLaunchVelocity', () => {
  it('等速直線運動のサンプルから正しい速度を推定する', () => { /* … */ });
  it('サンプル数が不足している場合はnullを返す', () => { /* … */ });
  it('全サンプルが同一時刻の場合はnullを返す（ゼロ除算の保護）', () => { /* … */ });
  it('全サンプルが同一座標の場合は速度0としてnullを返す', () => { /* … */ });
  it('MIN_FLICK_SPEED未満の入力はnullを返す', () => { /* … */ });
  it('MAX_FLICK_SPEEDを超える入力はクランプされる', () => { /* … */ });
  it('クランプ後も方向が保たれる', () => { /* … */ });
  it('時間窓外の古いサンプルを無視する', () => { /* … */ });
  it('PEAK_BLEND=0なら回帰値のみを使う', () => { /* … */ });
  it('PEAK_BLEND=1ならピーク値のみを使う', () => { /* … */ });
});
```

## 11.6 `core/coords.ts` — 座標変換

```ts
describe('coords', () => {
  it('論理→画面→論理の往復で元の値に戻る', () => {
    for (const [vw, vh] of [[375,667],[393,852],[412,915],[820,1180]]) {
      const layout = computeLayout(vw, vh, params);
      const p = { x: 500, y: 900 };
      const back = screenToLogical(logicalToScreen(p, layout), layout);
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  });

  it('論理高さがクランプ範囲内に収まる', () => { /* … */ });
  it('盤面がビューポート内に完全に収まる', () => { /* … */ });
  it('レターボックスが上下または左右のどちらか一方のみに出る', () => { /* … */ });
});
```

## 11.7 `core/rng.ts` — 乱数

```ts
describe('createRng', () => {
  it('同じシードから同じ系列を生成する', () => { /* … */ });
  it('異なるシードから異なる系列を生成する', () => { /* … */ });
  it('next()が常に[0,1)に収まる', () => { /* … */ });
  it('int(min,max)が常に[min,max]の整数を返す', () => { /* … */ });
  it('シード0でも不動点にならない', () => { /* … */ });
});
```

「シード0で不動点にならない」は xorshift の既知の落とし穴である。`state = 0` のとき xorshift は永久に 0 を返し続け、盤面生成が完全に固定される。

## 11.8 CI での実行

[10-build-deploy.md](./10-build-deploy.md) の `verify` ジョブで、`typecheck` → `lint` → `test` → `build` の順に実行する。

これらは PR でも main への push でも走り、**`deploy` ジョブは `verify` の成功を `needs` で待つ**。したがって、テストが落ちている状態のものが GitHub Pages に公開されることはない。

### 実行時間の目安

テスト対象が純粋関数のみで、Matter.js もブラウザも起動しないため、**数秒で完了する**。この速さが、実装中に頻繁にテストを回す習慣を支える。

## 11.9 テストしないものの扱い

物理挙動と手触りは、[09-tuning.md](./09-tuning.md) 9.4節のチューニング手順と、原文 §19 の評価基準に従って**実機で目視・体感によって評価する**。

| 確認項目 | 確認方法 |
|---|---|
| 狙った方向へ飛ぶか | 実機で10回投げ、意図と結果のズレを観察 |
| 強弱を使い分けられるか | 近距離と遠距離を交互に狙う |
| 停止距離を学習できるか | 初見の人に5ゲーム遊んでもらい、命中率の変化を見る |
| ミスの理由が分かるか | 被覆率表示を見て「なぜ取れなかったか」を言語化できるか |
| Retry したくなるか | 終了直後の行動を観察する |

これらを自動化しようとしないこと。自動化できない部分にこそ本作の価値があり、そこに人間の時間を使うために、機械的な部分をテストで固めている。
