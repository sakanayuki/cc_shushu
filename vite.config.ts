import { defineConfig } from 'vite';

// GitHub Pages のプロジェクトサイトは
// https://sakanayuki.github.io/cc_shushu/ に配信されるため base が必須。
// リポジトリ名を変更した場合はここも必ず追従させること。
export default defineConfig({
  base: '/cc_shushu/',
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: true,
  },
});
