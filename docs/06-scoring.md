# 06. 幾何計算と決着処理

## 6.1 円-円レンズ面積

被覆率の計算にはピクセルサンプリングやモンテカルロ法を使わず、**解析解**を用いる。投げカードも置きカードも円形（決定17）であるため、これが可能である。

### 利点

| 利点 | 内容 |
|---|---|
| 厳密 | 「ちょうど50%」の境界で誤差による判定のブレが起きない |
| 高速 | 5枚 × 最大5枚 = 25回の計算のみ。1フレーム未満で完了する |
| 回転非依存 | 円は回転しても形が変わらないため、Matter.js 上の角度を無視できる |
| 決定論的 | サンプリングと違い、同じ配置なら必ず同じ結果 |

### 実装

```ts
// core/geometry.ts
export function circleOverlapArea(
  c1: Vec2, r1: number, c2: Vec2, r2: number
): number {
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d = Math.hypot(dx, dy);

  // 離れている
  if (d >= r1 + r2) return 0;

  // 一方が他方を完全に内包している
  if (d <= Math.abs(r1 - r2)) {
    const r = Math.min(r1, r2);
    return Math.PI * r * r;
  }

  // 部分的に重なっている（レンズ面積）
  const a1 = Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1));
  const a2 = Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
  const tri = 0.5 * Math.sqrt(
    (-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2)
  );
  // 外接ぎりぎりでは桁落ちで負値になりうるため、妥当な範囲へ丸める
  const area = r1 * r1 * a1 + r2 * r2 * a2 - tri;
  return clamp(area, 0, Math.PI * Math.min(r1, r2) ** 2);
}
```

### 数値的注意点

- `Math.acos` の引数は丸め誤差で `±1` をわずかに超えることがある。**必ず `[-1, 1]` にクランプしてから渡す**
- 三角形の項の平方根の中身も、`d` が `r1+r2` にほぼ等しいとき丸め誤差で負になりうる。`Math.max(0, ...)` で保護する
- `d === 0`（中心一致）は内包の分岐で捕捉されるため、ゼロ除算は起きない
- **外接ぎりぎり（`d ≒ r1 + r2`）では円弧項と三角形項がほぼ等しくなり、桁落ちで差が微小な負値になる。** 実装時のテストで実際に検出された。最終結果を `[0, π × min(r1,r2)²]` にクランプして保護する

これらの境界条件はすべて単体テストで検証する（[11-testing.md](./11-testing.md)）。

## 6.2 被覆率

```text
coverage(P) = Σ_{T ∈ 投げカード} overlapArea(P, T) ÷ (π × P.radius²)
```

分母は**置きカードの面積**である。「そのカードの面積の過半数を超えた時点で取れる」というルールの直接的な表現になっている。

### 単純加算が厳密である理由

投げカード同士は剛体であり、物理的に重なることができない。したがって複数の投げカードが1つの置きカードを覆うとき、それらの重なり領域は互いに素であり、**面積の単純加算が和集合面積と厳密に一致する**。包除原理を持ち出す必要がなく、二重計上も原理的に起きない。

この性質により「もう1枚寄せて取る」という逆転劇が、幾何学的な破綻なしに成立する。

### クランプ

理論上 `coverage` は 1 を超えないが、浮動小数点誤差に備えて `Math.min(1, coverage)` でクランプする。表示上も 100% を超えた値が出ないようにする。

### 獲得条件

```text
captured = coverage > CAPTURE_THRESHOLD    (CAPTURE_THRESHOLD = 0.5)
```

**厳密な不等号**を用いる。「過半数を超えた時点」という定義に忠実に、ちょうど50%では獲得しない。

浮動小数点で厳密に 0.5 になることは実質起こらないため、この選択は実プレイに影響しない。ただし仕様を一意に定めておくことで、テストが書ける状態になる。

## 6.3 決着処理

`core/resolve.ts` の `resolveTurn` が、全カード停止後の盤面から次の盤面を導出する。**純粋関数であり、副作用を一切持たない。**

```ts
export function resolveTurn(
  board: BoardState,
  rng: Rng,
  params: GameParams,
  layout: Layout
): TurnResult;
```

### 処理順序

順序が入れ替わると結果が変わるため、実装上も固定する。

```text
[1] 被覆率の計算
    すべての置きカード P について coverage(P) と
    重なっている投げカードのID集合を求める
    （overlapArea > 0 のものだけを「重なっている」とみなす）
        ↓
[2] 獲得判定
    coverage > 0.5 の置きカードを captured とする
        ↓
[3] 回収
    captured な置きカードを placed から除去し、その score を加算
    captured な置きカードに重なっていた投げカードのIDを収集し、
    thrown から除去して hand に戻す（+1 枚ずつ）
        ↓
[4] 空振り除去
    [3] で回収されなかった投げカードのうち、
    どの置きカードとも overlapArea === 0 のものを thrown から除去する
    （hand には戻さない＝失われる）
        ↓
[5] 掠り残留
    残った投げカード（置きカードに重なるが未獲得）はそのまま thrown に残る
        ↓
[6] 補充
    [3] で空いた slotIndex ごとに refillSlot() を呼び、
    新しい置きカードを placed に追加する
        ↓
[7] 終了判定
    hand === 0 なら isGameOver = true
```

### 境界ケースの扱い

| ケース | 扱い |
|---|---|
| 1枚の投げカードが複数の置きカードを同時に獲得させた | 両方獲得する。その投げカードは**1枚だけ手札に戻る**（複製しない） |
| 1枚の投げカードが、獲得された置きカードと未獲得の置きカードの両方に重なっている | 獲得に寄与したので回収され、手札に戻る。未獲得側の盤面には残らない |
| 接するだけ（`overlapArea === 0`）の投げカード | 「重なっていない」とみなす。空振り扱いで除去される |
| 手札が0になったが盤面に掠りカードが残っている | ゲーム終了。残ったカードは回収されない |
| 補充位置が見つからない | その盤面は置きカードが1枚少ない状態で継続する（[07-board.md](./07-board.md) 参照） |

1つめのケースは実装事故を起こしやすい。**回収する投げカードのIDは `Set` で重複排除してから手札に加算する**こと。

### 実装スケッチ

```ts
export function resolveTurn(board, rng, params, layout): TurnResult {
  // [1] 被覆率
  const coverages: CoverageResult[] = board.placed.map((p) => {
    const area = Math.PI * p.radius * p.radius;
    let sum = 0;
    const ids: number[] = [];
    for (const t of board.thrown) {
      const a = circleOverlapArea(p.pos, p.radius, t.pos, t.radius);
      if (a > 0) { sum += a; ids.push(t.id); }
    }
    const coverage = Math.min(1, sum / area);
    return {
      placedId: p.id,
      coverage,
      coveringThrownIds: ids,
      captured: coverage > params.captureThreshold,
    };
  });

  // [2][3] 獲得と回収
  const capturedResults = coverages.filter((c) => c.captured);
  const capturedIds = new Set(capturedResults.map((c) => c.placedId));
  const capturedCards = board.placed.filter((p) => capturedIds.has(p.id));
  const gainedScore = capturedCards.reduce((s, p) => s + p.score, 0);

  // 重複排除が必須（1枚が複数カードの獲得に寄与しうる）
  const collected = new Set<number>();
  for (const c of capturedResults) {
    for (const id of c.coveringThrownIds) collected.add(id);
  }

  // [4] 空振り除去
  const overlappingAny = new Set<number>();
  for (const c of coverages) {
    for (const id of c.coveringThrownIds) overlappingAny.add(id);
  }
  const whiffed = board.thrown
    .filter((t) => !collected.has(t.id) && !overlappingAny.has(t.id))
    .map((t) => t.id);

  // [5] 掠り残留
  const whiffedSet = new Set(whiffed);
  const nextThrown = board.thrown.filter(
    (t) => !collected.has(t.id) && !whiffedSet.has(t.id)
  );

  // [6] 補充
  let placed = board.placed.filter((p) => !capturedIds.has(p.id));
  let nextId = board.nextId;
  for (const c of capturedCards) {
    const card = refillSlot(
      { ...board, placed, thrown: nextThrown }, c.slotIndex,
      rng, params, layout, nextId
    );
    if (card) { placed = [...placed, card]; nextId++; }
  }

  const hand = board.hand + collected.size;
  return {
    nextBoard: { placed, thrown: nextThrown, hand, score: board.score + gainedScore, nextId },
    coverages,
    capturedCards,
    collectedThrownIds: [...collected],
    whiffedThrownIds: whiffed,
    gainedScore,
    isGameOver: hand === 0,
  };
}
```

## 6.4 ゲームの有限性

決着処理は以下の不変条件を保つ。

```text
カード総数 = hand + thrown.length
```

| イベント | カード総数への影響 |
|---|---|
| 投擲 | 変化なし（hand −1、thrown +1） |
| 獲得・回収 | 変化なし（thrown −n、hand +n） |
| 掠り残留 | 変化なし |
| **空振り除去** | **−n** |
| **場外ロスト** | **−n** |

カード総数は初期値5から始まり、空振りとロストでのみ減少する単調減少列である。したがって：

- **手札が初期5枚を超えることは構造的にあり得ない**（上限管理が不要）
- **ゲームは必ず有限手で終了する**（無限ループにならない）

この性質は単体テストで検証する。

## 6.5 表示への反映

`TurnResult` は次の盤面だけでなく、表示に必要な情報をすべて含んでいる。これにより `ui` / `render` レイヤが盤面を再計算する必要がなくなる。

| フィールド | 表示への使われ方 |
|---|---|
| `coverages` | **未獲得のカードも含む全カードの被覆率**。停止直後に各置きカードの上へ「48%」のように表示する |
| `capturedCards` | 獲得カードの得点ポップと回収アニメ |
| `collectedThrownIds` | 手札に戻るカードのアニメーション |
| `whiffedThrownIds` | 空振りで消えるカードのフェードアウト |
| `gainedScore` | 累計得点への加算表示 |

`coverages` に未獲得カードを含めることは、原文 §20「失敗理由を明確にする」の実装上の要である。「48% だった」と数値で見えることで、プレイヤーは「もう少し右に止めるべきだった」「もう1枚寄せれば取れた」と原因を特定でき、次のフリックを修正できる。
