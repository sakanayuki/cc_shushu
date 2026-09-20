/** 論理座標系上の点。単位は論理px（docs/05-physics.md 5.1節） */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** 難易度帯 */
export type Difficulty = 'easy' | 'normal' | 'hard';

/** 盤面に置かれた得点対象のカード。静的センサーで、動かない */
export interface PlacedCard {
  readonly id: number;
  readonly pos: Vec2;
  readonly radius: number;
  /** 難易度帯内でランダムに決定された得点（整数） */
  readonly score: number;
  readonly difficulty: Difficulty;
  /** どの難易度スロットに属するか。獲得時にこのスロットが補充対象になる */
  readonly slotIndex: number;
}

/** プレイヤーが投げたカード。物理ボディで、投げカード同士は衝突する */
export interface ThrownCard {
  readonly id: number;
  readonly pos: Vec2;
  readonly velocity: Vec2;
  readonly radius: number;
}

/** 盤面の全状態。これ以外にゲームの状態は存在しない */
export interface BoardState {
  readonly placed: readonly PlacedCard[];
  readonly thrown: readonly ThrownCard[];
  /** まだ投げていない手札の枚数 */
  readonly hand: number;
  readonly score: number;
  /** 次に採番するID */
  readonly nextId: number;
}

/** 1枚の置きカードに対する被覆の計算結果 */
export interface CoverageResult {
  readonly placedId: number;
  /** 重なり面積の合計 ÷ 置きカードの面積。0..1 にクランプ済み */
  readonly coverage: number;
  /** 重なっていた投げカードのID。面積0の接触は含まない */
  readonly coveringThrownIds: readonly number[];
  readonly captured: boolean;
}

/** 決着処理の結果。UIの表示と次フレームの盤面の両方をここから得る */
export interface TurnResult {
  readonly nextBoard: BoardState;
  /** 全置きカードの被覆率。未獲得のものも含む（被覆率表示に使う） */
  readonly coverages: readonly CoverageResult[];
  readonly capturedCards: readonly PlacedCard[];
  /** 手札に戻った投げカードのID */
  readonly collectedThrownIds: readonly number[];
  /** 空振りで失われた投げカードのID */
  readonly whiffedThrownIds: readonly number[];
  readonly gainedScore: number;
  readonly isGameOver: boolean;
}

/** ゲーム状態機械の状態 */
export type Phase =
  | 'title'
  | 'ready'
  | 'aiming'
  | 'flying'
  | 'resolving'
  | 'gameover';
