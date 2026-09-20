import type { PointerSample } from '../core/flick';

export interface SampleHistory {
  push(t: number, x: number, y: number): void;
  /** 直近 windowMs 以内のサンプルを古い順に返す */
  recent(nowMs: number, windowMs: number): PointerSample[];
  clear(): void;
}

/** PointerMove を記録するリングバッファ。座標は論理座標で渡すこと */
export function createSampleHistory(capacity: number): SampleHistory {
  const buf: PointerSample[] = [];
  let head = 0;

  return {
    push(t, x, y) {
      const sample = { t, x, y };
      if (buf.length < capacity) {
        buf.push(sample);
      } else {
        buf[head] = sample;
        head = (head + 1) % capacity;
      }
    },
    recent(nowMs, windowMs) {
      const ordered =
        buf.length < capacity ? buf.slice() : [...buf.slice(head), ...buf.slice(0, head)];
      const cutoff = nowMs - windowMs;
      return ordered.filter((s) => s.t >= cutoff);
    },
    clear() {
      buf.length = 0;
      head = 0;
    },
  };
}
