export const FIXED_DT = 1000 / 60;
export const MAX_SUBSTEPS = 5;

/**
 * 固定タイムステップのアキュムレータ。
 * 描画フレームレートに物理挙動を依存させないことで、60Hz端末と120Hz端末で
 * 同じ初速のカードが同じ距離で止まることを保証する（docs/05-physics.md 5.6節）。
 */
export function createStepper(onStep: (dt: number) => void): (elapsedMs: number) => void {
  let accumulator = 0;

  return (elapsedMs: number) => {
    // タブ復帰時の巨大な elapsed で処理が固まるのを防ぐ
    accumulator += Math.min(elapsedMs, FIXED_DT * MAX_SUBSTEPS);
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
      onStep(FIXED_DT);
      accumulator -= FIXED_DT;
      steps++;
    }
  };
}
