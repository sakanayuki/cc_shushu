import type { Layout } from '../core/coords';
import { screenToLogical } from '../core/coords';
import type { Vec2 } from '../core/types';
import { createSampleHistory, type SampleHistory } from './history';

export interface PointerHandlers {
  /** 射出領域内で押下された。論理座標を渡す */
  onDown(pos: Vec2): boolean;
  /** 指を離した。履歴と離した時刻を渡す */
  onUp(history: SampleHistory, upTimeMs: number): void;
  onCancel(): void;
}

export interface PointerInput {
  history: SampleHistory;
  setLayout(layout: Layout): void;
  dispose(): void;
}

export function createPointerInput(
  target: HTMLElement,
  initialLayout: Layout,
  capacity: number,
  handlers: PointerHandlers,
): PointerInput {
  let layout = initialLayout;
  const history = createSampleHistory(capacity);
  let activeId: number | null = null;

  const toLogical = (e: { clientX: number; clientY: number }): Vec2 => {
    const rect = target.getBoundingClientRect();
    return screenToLogical({ x: e.clientX - rect.left, y: e.clientY - rect.top }, layout);
  };

  const onPointerDown = (e: PointerEvent): void => {
    // マルチタッチは最初の1本のみ受理する
    if (activeId !== null) return;
    const pos = toLogical(e);
    if (!handlers.onDown(pos)) return;

    activeId = e.pointerId;
    history.clear();
    history.push(e.timeStamp, pos.x, pos.y);
    target.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (e.pointerId !== activeId) return;
    // 高頻度サンプルが取れる環境では推定精度が上がる
    const events: { clientX: number; clientY: number; timeStamp: number }[] =
      e.getCoalescedEvents?.() ?? [e];
    for (const ev of events) {
      const pos = toLogical(ev);
      history.push(ev.timeStamp, pos.x, pos.y);
    }
  };

  const release = (e: PointerEvent): void => {
    if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
    activeId = null;
  };

  const onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId !== activeId) return;
    const pos = toLogical(e);
    history.push(e.timeStamp, pos.x, pos.y);
    release(e);
    handlers.onUp(history, e.timeStamp);
  };

  const onPointerCancel = (e: PointerEvent): void => {
    if (e.pointerId !== activeId) return;
    release(e);
    handlers.onCancel();
  };

  target.addEventListener('pointerdown', onPointerDown);
  target.addEventListener('pointermove', onPointerMove);
  target.addEventListener('pointerup', onPointerUp);
  target.addEventListener('pointercancel', onPointerCancel);

  return {
    history,
    setLayout(next) {
      layout = next;
    },
    dispose() {
      target.removeEventListener('pointerdown', onPointerDown);
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerUp);
      target.removeEventListener('pointercancel', onPointerCancel);
    },
  };
}
