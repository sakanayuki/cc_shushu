# 07. 盤面生成と乱数

## 7.1 乱数管理

**すべての乱数はシード付き擬似乱数（xorshift32）を経由する。`Math.random()` は使用禁止とする。**

```ts
// core/rng.ts
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;   // 0 は不動点なので回避

  const next32 = (): number => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;  state >>>= 0;
    return state;
  };

  return {
    next: () => next32() / 0x100000000,
    range: (min, max) => min + (next32() / 0x100000000) * (max - min),
    int: (min, max) => min + Math.floor((next32() / 0x100000000) * (max - min + 1)),
    getState: () => state,
  };
}
```

### シードの決定

```text
?seed=12345 が URL にある  → そのシードを使う
それ以外                    → Date.now() を 32bit に丸めてシードとする
```

現在のシードは常にデバッグパネルに表示し、URL へ反映するボタンを用意する。

| 用途 | 効果 |
|---|---|
| チューニング | 「同じ盤面のまま物理パラメータだけ変えて比較する」ができる。原文 §18 の摩擦・停止距離の調整が主観から脱する |
| バグ再現 | 不具合が出た盤面をURLで共有し、確実に再現できる |
| テスト | 配置アルゴリズムの単体テストがシード固定で書ける |
| 共有 | 静的ホスティングのまま、友人と同じ盤面で競える |

### 乱数を使う箇所・使わない箇所

| 箇所 | 乱数 |
|---|---|
| 置きカードの位置・半径・得点 | **使う** |
| 物理演算 | 使わない |
| 入力の速度推定 | 使わない |
| 判定処理 | 使わない |

原文 §20「ランダム性より再現性を優先し、プレイヤーが経験から精度を上げられるようにする」に従い、**プレイヤーの技術が結果に変換される経路には乱数を一切入れない**。乱数は「どんな問題が出題されるか」のみを決める。

## 7.2 難易度スロット制

完全ランダム配置にはしない（原文 §6）。盤面を距離帯で分割し、難易度スロットを固定する。

| スロット | 難易度 | 枚数 | 距離帯（配置可能域内の比率） | 半径 | 得点 |
|---:|---|---:|---|---|---:|
| 0 | Easy | 1 | 0.15 〜 0.40 | 40 〜 50 | 10 〜 20 |
| 1 | Easy | 1 | 0.15 〜 0.40 | 40 〜 50 | 10 〜 20 |
| 2 | Normal | 1 | 0.40 〜 0.70 | 27 〜 38 | 30 〜 50 |
| 3 | Normal | 1 | 0.40 〜 0.70 | 27 〜 38 | 30 〜 50 |
| 4 | Hard | 1 | 0.70 〜 0.95 | 18 〜 25 | 60 〜 100 |

寸法はすべて**半径**（論理px）である。置きカードの半径は投げカードの半径 46 を超えないよう設定している（[02-rules.md](./02-rules.md) 2.6節）。

距離の比率は、**配置可能域の下端（比率0 = 最も手前）から上端（比率1 = 最も奥）までの割合**で定義する。

```ts
const span = layout.placedAreaBottom - layout.placedAreaTop;
const y = layout.placedAreaBottom - span * rng.range(band.min, band.max);
```

**比率で定義することで、論理高さがクランプによって変動しても難易度の意味が保たれる。** 例えば Hard は常に「盤面の最も奥」であり、絶対座標で固定した場合のように、端末によって Hard が中距離になってしまう事故が起きない。

### 基準を射出ラインにしてはいけない理由

当初この比率を「射出ライン `launchY` からの距離」で定義していたが、実装時のテストで**論理高さ1600の端末（iPad縦など）で Easy カードが一切配置できなくなる**ことが判明した。

`launchY` と `placedAreaBottom` の間には射出領域とクリアランスで約410論理px の空白があるため、`launchY` を基準にすると近距離帯（比率0.15〜0.40）が配置可能域の下端より下に落ちてしまう。論理高さ1600では Easy の抽選範囲が `y ∈ [918, 1226]` となる一方、`placedAreaBottom` は 960 であり、半径50のカードを置ける `y ≤ 910` を満たす値が範囲内にほぼ存在しなくなる。

配置可能域そのものを基準にすれば、比率の全範囲が定義上必ず配置可能域に収まる。

### スロット制の意図

原文 §6 の「安全な低得点と難しい高得点の複数の選択肢を作る」を**構造的に保証する**ため。完全ランダムだと「全部近くに大きなカードが並ぶ」「Hardが3枚並ぶ」といった選択肢のない盤面が発生しうる。

スロットは**獲得されても同じ難易度で補充される**（7.4節）ため、この構成はゲーム中ずっと維持される。

## 7.3 配置制約とリジェクションサンプリング

新しい置きカードの位置は、以下の制約をすべて満たすまで再抽選する。

```text
[C1] 盤面端から EDGE_MARGIN 以上離れている
       x ∈ [EDGE_MARGIN + r, LOGICAL_WIDTH - EDGE_MARGIN - r]

[C2] 配置可能域の内側にある
       y - r >= placedAreaTop
       y + r <= placedAreaBottom

[C3] 他のすべての置きカードと TARGET_MIN_GAP 以上離れている
       distance(this, other) >= this.r + other.r + TARGET_MIN_GAP

[C4] 盤面に残っているすべての投げカードと重なっていない
       distance(this, thrown) >= this.r + thrown.r + REFILL_CLEARANCE

[C5] 距離帯の範囲内にある（7.2節）
```

### C4 が必要な理由

補充時、盤面には掠りカードが残っている。そこに新しい置きカードを重ねて出現させると、**プレイヤーが何もしていないのに次の瞬間いきなり獲得が成立する**可能性がある。これは「自分の入力 → 結果」の対応を壊すため禁止する。

`REFILL_CLEARANCE`（初期値 20）だけ余分に離すことで、わずかな重なりも生じないようにする。

### リジェクションサンプリング

```ts
export function refillSlot(
  board, slotIndex, rng, params, layout, id
): PlacedCard | null {
  const slot = params.slots[slotIndex];
  for (let attempt = 0; attempt < params.maxPlacementAttempts; attempt++) {
    const radius = rng.range(slot.radiusMin, slot.radiusMax);
    const span = layout.launchY - layout.placedAreaTop;
    const y = layout.launchY - span * rng.range(slot.distMin, slot.distMax);
    const x = rng.range(
      params.edgeMargin + radius,
      layout.logicalWidth - params.edgeMargin - radius
    );
    const pos = { x, y };
    if (!satisfiesConstraints(pos, radius, board, params, layout)) continue;
    return {
      id, pos, radius, slotIndex,
      difficulty: slot.difficulty,
      score: rng.int(slot.scoreMin, slot.scoreMax),
    };
  }
  return null;   // 置けなかった
}
```

| パラメータ | 初期値 |
|---|---:|
| `TARGET_MIN_GAP` | 40 |
| `EDGE_MARGIN` | 60 |
| `REFILL_CLEARANCE` | 20 |
| `MAX_PLACEMENT_ATTEMPTS` | 200 |

### 配置に失敗した場合

200回試行しても置けない場合は `null` を返し、**その盤面は置きカードが1枚少ない状態で継続する**。

盤面が詰まって配置できない状況は、掠りカードが多数残っているときに起こりうる。ただしそれは「プレイヤーが取れずに散らかした結果」であり、ゲーム的には自然な帰結である。次の投擲で掠りカードが回収されるか空振り除去されれば、スロットは再び空くので、**次の決着処理で改めて補充を試みる**。

この再試行のため、`resolveTurn` は毎回「空いているスロット」をすべて走査する（獲得されたスロットだけを見るのではない）。

### 段階的緩和

`MAX_PLACEMENT_ATTEMPTS` の半分（100回）を超えたら、`TARGET_MIN_GAP` を段階的に緩和する（40 → 20 → 0）。これにより、わずかに詰まっているだけの盤面で不必要に配置を諦めることを防ぐ。`C4`（投げカードとの非重複）だけは**絶対に緩和しない**。

## 7.4 補充のルール

```text
獲得によってスロット i が空いた
        ↓
同じスロット i の難易度帯・半径範囲・得点範囲で再抽選
        ↓
位置は C1〜C5 を満たすまでリジェクションサンプリング
        ↓
新しい PlacedCard として placed に追加
```

**同じスロットで補充する**ことにより、盤面の難易度構成（Easy2 / Normal2 / Hard1）がゲーム中ずっと維持される。「安全な低得点と難しい高得点の選択肢が常にある」という原文 §6 の要求が、補充制になっても保たれる。

得点は毎回引き直されるため、同じ Hard スロットでも「今回は62点」「次は97点」と変動し、盤面を読む面白さが生まれる。

### 得点が難易度と相関する根拠

得点を完全ランダム（サイズ・距離と無相関）にすると、「大きくて近いのに100点」が出現し、原文 §6 の「高得点ほど狙いにくい」というリスク・リターン構造が崩れる。難易度帯内でのランダム化は、**毎回値が変わる新鮮さ**と**リスク・リターンの一貫性**を両立させる。

## 7.5 初期盤面の生成

```ts
export function createInitialBoard(rng, params, layout): BoardState {
  let placed: PlacedCard[] = [];
  let nextId = 1;
  const empty = { placed: [], thrown: [], hand: params.initialHand, score: 0, nextId };

  for (let i = 0; i < params.slots.length; i++) {
    const card = refillSlot({ ...empty, placed }, i, rng, params, layout, nextId);
    if (card) { placed.push(card); nextId++; }
  }

  return { placed, thrown: [], hand: params.initialHand, score: 0, nextId };
}
```

初期状態では盤面に投げカードがないため、`C4` は自明に満たされ、配置が失敗することは実質ない。

### 配置順序

スロット 0 から順に配置する。Hard（スロット4）が最後になるため、最も小さく置き場所の自由度が高いカードが最後に配置されることになり、失敗しにくい。

なお、スロット順に配置することで、**同じシードからは必ず同じ初期盤面が生成される**。これがテストと再現性の基礎になる。
