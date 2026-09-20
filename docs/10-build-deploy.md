# 10. ビルドとデプロイ

**前提条件**: GitHub Actions 経由で GitHub Pages に反映されること。本章はその技術要件を満たす構成を定義する。

## 10.1 技術スタック

| 項目 | 選択 |
|---|---|
| 言語 | TypeScript（`strict: true`） |
| ビルド | Vite |
| 物理エンジン | Matter.js（npm 依存、CDN は使わない） |
| テスト | Vitest |
| Lint | ESLint（flat config）+ TypeScript ESLint |
| デプロイ | GitHub Actions → GitHub Pages |

### TypeScript + Vite を選んだ根拠

| 観点 | 内容 |
|---|---|
| 型安全 | [09-tuning.md](./09-tuning.md) の20以上のパラメータを型付きオブジェクトで扱える。`BoardState` などのドメイン型が実装の指針になる |
| テスト | Vitest が Vite の設定をそのまま使うため、`core` の純粋関数テストが設定ほぼゼロで動く |
| 開発速度 | HMR により物理パラメータの調整サイクルが速い |
| Matter.js の型 | `@types/matter-js` により API を型付きで扱える |
| CDN を使わない理由 | 外部CDNへの実行時依存は、障害時にゲームが起動しなくなる。npm 依存ならビルド時に固定される |

## 10.2 依存パッケージ

```json
{
  "name": "cc-shushu",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "dependencies": {
    "matter-js": "^0.20.0"
  },
  "devDependencies": {
    "@types/matter-js": "^0.19.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0",
    "eslint": "^9.0.0",
    "typescript-eslint": "^8.0.0"
  }
}
```

バージョンは実装着手時点の安定版に合わせる。`package-lock.json` をコミットし、CI では `npm ci` を使って再現性を担保する。

## 10.3 Vite 設定

```ts
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages のプロジェクトサイトは
  // https://sakanayuki.github.io/cc_shushu/ に配信されるため、
  // アセットのパス解決に base が必須
  base: '/cc_shushu/',
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: true,
  },
});
```

### `base` が必須である理由

GitHub Pages のプロジェクトサイトはリポジトリ名のサブパス配下に配信される。

```text
https://sakanayuki.github.io/cc_shushu/
```

`base` を指定しないと、ビルド成果物が `/assets/index-xxxx.js` という絶対パスを参照し、`https://sakanayuki.github.io/assets/...` を読みに行って404になる。`base: '/cc_shushu/'` により `/cc_shushu/assets/...` が生成される。

**リポジトリ名を変更した場合は `base` も必ず追従させること。** これは最も起きやすいデプロイ事故である。

### 開発時との差異

`vite dev` は `base` を考慮してローカルサーバのパスを調整するため、開発時も `http://localhost:5173/cc_shushu/` でアクセスすることになる。デバッグ用のクエリパラメータは `http://localhost:5173/cc_shushu/?debug=1&seed=123` の形になる。

## 10.4 GitHub Actions ワークフロー

**単一ファイル `deploy.yml` に、`verify` → `deploy` の2ジョブを連鎖させる。**

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test
      - run: npm run build

      - name: Upload Pages artifact
        if: >-
          github.ref == 'refs/heads/main' &&
          (github.event_name == 'push' || github.event_name == 'workflow_dispatch')
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: verify
    if: >-
      github.ref == 'refs/heads/main' &&
      (github.event_name == 'push' || github.event_name == 'workflow_dispatch')
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### 設計判断

| 判断 | 根拠 |
|---|---|
| 1ファイルに2ジョブ | `needs: verify` により**検証を通らないものが公開されない**ことが保証される。CI とデプロイを別ファイルに分けると、デプロイ側が検証を待たずに走ってしまう |
| PR でも `verify` が走る | 型エラーや壊れた得点計算をマージ前に検出する |
| PR では `deploy` が走らない | `if` 条件で `push` かつ `main` に限定 |
| `concurrency: pages` | 連続 push 時のデプロイ競合を防ぐ |
| `cancel-in-progress: false` | 進行中のデプロイを中断すると Pages が不整合な状態になりうるため、キャンセルしない |
| `workflow_dispatch` | 手動再実行の口を残す。**deploy の `if` にも含めないと手動実行で公開されない**（当初これを漏らしていた） |

### 権限

`actions/deploy-pages@v4` は OIDC トークンでデプロイするため、以下の3つが必須である。

```yaml
permissions:
  contents: read      # チェックアウト
  pages: write        # Pages へのデプロイ
  id-token: write     # OIDC トークンの発行
```

いずれかが欠けるとデプロイが権限エラーで失敗する。

## 10.5 GitHub Pages の設定

リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定する。

| 方式 | 採否 | 理由 |
|---|---|---|
| **GitHub Actions** | **採用** | ビルド成果物を直接デプロイできる。`gh-pages` ブランチが不要で、履歴が汚れない |
| Deploy from a branch (`gh-pages`) | 不採用 | ビルド成果物をコミットする必要があり、リポジトリが肥大化する。指定された「GitHub Actions 経由」という要件にも合わない |

この設定は**リポジトリ設定の手動操作が1回だけ必要**であり、ワークフローファイルだけでは完結しない。初回デプロイ前に必ず設定すること。

### 設定を誤ると「真っ黒な画面」になる（実際に発生した）

Source が **Deploy from a branch** のままだと、GitHub の旧来のビルダー（ワークフロー名 `pages build and deployment`、パス `dynamic/pages/pages-build-deployment`）が同時に動き、**リポジトリの生のファイルをそのまま公開する**。

生の `index.html` は開発用に `/src/main.ts`（TypeScript のソース）を参照しているため、ブラウザは読み込めず 404 になる。結果として Canvas が初期化されず、**画面が真っ黒のまま何も起きない**。

さらに厄介なことに、これは**競合状態**である。

```text
22:48:10  Deploy to GitHub Pages     -> dist/ を公開（正しい）
22:48:17  pages build and deployment -> 7秒後に生ファイルで上書き（壊れる）
```

どちらが後に完了するかで結果が変わるため、「前回は動いたのに今回は黒い」という再現性のない不具合に見える。実際にこのプロジェクトで発生した。

**対処**: Settings → Pages → Source を **GitHub Actions** にする。これにより旧来のビルダーが動かなくなり、競合そのものが消える。

### 起動失敗を黒画面にしない

上記のような配信事故は、Canvas ベースのアプリでは「真っ黒な画面」としてしか現れず、原因が分からない。そこで `index.html` に既定で表示される `#boot-error` を置き、`main.ts` が起動しきった時点で `body.booted` により隠している。

スクリプトの 404 や初期化時の例外では、このメッセージが残る。黒画面よりはるかに診断しやすい。

### 公開URL

```text
https://sakanayuki.github.io/cc_shushu/
```

デバッグUI付き:

```text
https://sakanayuki.github.io/cc_shushu/?debug=1
```

シード固定:

```text
https://sakanayuki.github.io/cc_shushu/?seed=12345
```

## 10.6 ブランチ運用

| ブランチ | 役割 | CI |
|---|---|---|
| `main` | 公開ブランチ。ここへの push が Pages に反映される | verify → deploy |
| `claude/*`、`feature/*` | 作業ブランチ | verify のみ |

作業ブランチから `main` への PR を経由することで、検証を通ったものだけが公開される。

## 10.7 静的ホスティングの制約と対応

GitHub Pages は静的ファイル配信のみであり、サーバサイド処理が存在しない。本作の設計はこれと完全に整合している。

| 機能 | 実現方法 |
|---|---|
| 盤面の共有 | URL クエリ `?seed=` にシードを載せる。サーバ不要 |
| ベストスコア | `localStorage` に保存。端末内に閉じる |
| デバッグ設定の永続 | `localStorage` に保存 |
| ランキング | **PoC では実装しない**（原文 §16） |

サーバを必要とする機能は PoC の範囲外であり、将来必要になった場合も、静的サイトのまま外部APIを呼ぶ形で追加できる。

## 10.8 トラブルシューティング

実装時に遭遇しやすい問題を先回りして記録する。

| 症状 | 原因 | 対処 |
|---|---|---|
| 画面が真っ白、コンソールに404 | `base` が未設定または不一致 | `vite.config.ts` の `base` をリポジトリ名に合わせる |
| **画面が真っ黒**、`/src/main.ts` が404 | Pages の Source がブランチ方式のまま。旧ビルダーが生ファイルを公開している | Settings → Pages → Source を GitHub Actions に |
| 前回は動いたのに今回は黒い | 上記の競合状態。どちらが後に完了したかで結果が変わる | 同上 |
| デプロイが権限エラー | `permissions` の不足 | `pages: write` と `id-token: write` を確認 |
| デプロイジョブがスキップされる | `if` 条件 | `main` への `push` であることを確認 |
| Pages に何も出ない | Source が未設定 | Settings → Pages → Source を GitHub Actions に |
| フリックでページがスクロールする | `touch-action` の未設定 | Canvas に `touch-action: none` |
| 実機で画面が縦に伸びる/切れる | `100vh` の使用 | `100dvh` を使う |
