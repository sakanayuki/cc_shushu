import type { Difficulty } from '../core/types';

export interface FlickParams {
  /** 指の速度(論理px/ms)を初速(論理px/step)に変換する係数 */
  flickPower: number;
  /** これ未満は誤タップとみなし投擲不成立 */
  minFlickSpeed: number;
  /** 初速の上限 */
  maxFlickSpeed: number;
  /** 速度推定に使う直近の時間窓(ms) */
  inputSampleWindowMs: number;
  /** 回帰値とピーク値のブレンド比 0..1 */
  peakBlend: number;
  /** 回帰に必要な最小サンプル数 */
  minSamples: number;
  /** 履歴リングバッファのサイズ */
  maxHistory: number;
}

export interface CardParams {
  /** 投げカードの半径(論理px)。全カード共通 */
  thrownRadius: number;
}

export interface PhysicsParams {
  /**
   * 等加速度減速の減速量（論理px/step^2）。
   * 毎ステップ速度の大きさからこの値を引き、0 を下回ったら停止させる。
   * 床の上を滑る物体のモデルであり、指数減衰と違って有限時間で厳密に停止する。
   */
  linearDecel: number;
  /**
   * 追加の指数減衰（0 で無効）。高速域だけ少し効かせたい場合に使う。
   * 0 のままなら停止距離は初速の2乗に比例する。
   */
  drag: number;
}

export interface SettleParams {
  stopSpeed: number;
  stopAngularSpeed: number;
  stopDurationMs: number;
  /** 強制停止までのフェイルセーフ */
  settleTimeoutMs: number;
  /** 判定結果の表示時間 */
  resolveDisplayMs: number;
}

export interface LayoutParams {
  logicalWidth: number;
  logicalHeightMin: number;
  logicalHeightMax: number;
  /** 盤面下端から射出ラインまでの距離 */
  launchOffsetY: number;
  /** 盤面下端から射出領域上端までの距離 */
  launchZoneHeight: number;
  /** 射出領域上端から配置可能域下端までの距離 */
  launchClearance: number;
  /** ロストラインから配置可能域上端までの距離 */
  lostClearance: number;
  edgeMargin: number;
  maxDpr: number;
}

export interface SlotDef {
  difficulty: Difficulty;
  /** 射出ラインから配置可能域上端までの距離に対する比率 */
  distMin: number;
  distMax: number;
  /** 半径(論理px)。直径ではない */
  radiusMin: number;
  radiusMax: number;
  scoreMin: number;
  scoreMax: number;
}

export interface BoardParams {
  slots: SlotDef[];
  /** 置きカード同士の最小隙間 */
  targetMinGap: number;
  /** 補充時、既存の投げカードから離す最小距離 */
  refillClearance: number;
  maxPlacementAttempts: number;
  /** 試行が進んだときの targetMinGap の段階的緩和 */
  gapRelaxSteps: number[];
}

export interface RuleParams {
  initialHand: number;
  /** 獲得に必要な被覆率。厳密に超える必要がある */
  captureThreshold: number;
  /**
   * 被覆率を和集合として求めるときのサンプル点数。
   * 投げカードが複数重なっている置きカードでのみ使われる。
   */
  coverageSamples: number;
}

export interface GameParams {
  flick: FlickParams;
  card: CardParams;
  physics: PhysicsParams;
  settle: SettleParams;
  layout: LayoutParams;
  board: BoardParams;
  rule: RuleParams;
}
