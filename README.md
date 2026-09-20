# Flick Card

スマートフォン縦持ちのWebブラウザ向け、Matter.js を用いた物理演算フリックゲーム。

画面下部からカードをフリックし、盤面に置かれたカードへ滑らせる。置きカードの**面積の過半数を覆うと獲得**でき、獲得に使ったカードは手札に戻る。外したカードは失われ、手札が尽きた時点で終了。

**公開URL**: https://sakanayuki.github.io/cc_shushu/

| クエリパラメータ | 効果 |
|---|---|
| `?debug=1` | 物理パラメータの調整パネルを表示（実機でそのまま調整できる） |
| `?seed=12345` | 盤面生成のシードを固定。同じ盤面を再現・共有できる |

## 開発

```bash
npm install
npm run dev        # http://localhost:5173/cc_shushu/
```

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバ（HMR） |
| `npm run build` | 本番ビルド（`dist/`） |
| `npm run preview` | ビルド成果物のプレビュー |
| `npm run typecheck` | 型検査 |
| `npm run lint` | ESLint |
| `npm run test` | Vitest |

## デプロイ

`main` への push で GitHub Actions が `typecheck` → `lint` → `test` → `build` を実行し、すべて通った場合のみ GitHub Pages へ公開する。PR では検証のみが走る。

初回のみ、リポジトリの **Settings → Pages → Source** を **GitHub Actions** に設定する必要がある。

## 構成

```text
src/
├── config/     全チューニングパラメータ
├── core/       幾何・判定・配置・乱数・状態遷移（外部依存ゼロの純粋関数）
├── physics/    Matter.js アダプタ
├── input/      Pointer Events → 速度推定
├── render/     Canvas 2D ＋ テーマ／スキン
└── ui/         HUD・リザルト・デバッグパネル
```

`core` は Matter.js にも DOM にも依存しないため、ゲームルール全体が純粋関数としてテストできる。カードの当たり判定（円）と描画は完全に分離されており、`render/theme.ts` と `render/skins/` を差し替えてもゲームバランスは変化しない。

## ドキュメント

設計の全体像と、30件の設計判断それぞれの根拠は [docs/](./docs/) を参照。

- [docs/README.md](./docs/README.md) — 索引と決定事項サマリ
- [docs/01-overview.md](./docs/01-overview.md) — 原文コンセプトからの変更点と理由
- [docs/09-tuning.md](./docs/09-tuning.md) — 全パラメータの初期値と根拠
