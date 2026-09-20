import type { GameParams } from '../config/params.types';
import type { FlickEstimate } from '../core/flick';

const STORAGE_KEY = 'cc_shushu:params';

interface SliderDef {
  section: string;
  label: string;
  get(p: GameParams): number;
  set(p: GameParams, v: number): void;
  min: number;
  max: number;
  step: number;
}

const SLIDERS: SliderDef[] = [
  { section: 'FLICK', label: 'flickPower', min: 1, max: 15, step: 0.1, get: (p) => p.flick.flickPower, set: (p, v) => { p.flick.flickPower = v; } },
  { section: 'FLICK', label: 'minFlickSpeed', min: 0, max: 30, step: 0.5, get: (p) => p.flick.minFlickSpeed, set: (p, v) => { p.flick.minFlickSpeed = v; } },
  { section: 'FLICK', label: 'maxFlickSpeed', min: 20, max: 120, step: 1, get: (p) => p.flick.maxFlickSpeed, set: (p, v) => { p.flick.maxFlickSpeed = v; } },
  { section: 'FLICK', label: 'sampleWindowMs', min: 30, max: 200, step: 5, get: (p) => p.flick.inputSampleWindowMs, set: (p, v) => { p.flick.inputSampleWindowMs = v; } },
  { section: 'FLICK', label: 'peakBlend', min: 0, max: 1, step: 0.05, get: (p) => p.flick.peakBlend, set: (p, v) => { p.flick.peakBlend = v; } },
  { section: 'PHYSICS', label: 'linearDecel', min: 0.05, max: 2, step: 0.005, get: (p) => p.physics.linearDecel, set: (p, v) => { p.physics.linearDecel = v; } },
  { section: 'PHYSICS', label: 'drag', min: 0, max: 0.05, step: 0.001, get: (p) => p.physics.drag, set: (p, v) => { p.physics.drag = v; } },
  { section: 'CARD', label: 'thrownRadius', min: 30, max: 200, step: 2, get: (p) => p.card.thrownRadius, set: (p, v) => { p.card.thrownRadius = v; } },
  { section: 'SETTLE', label: 'stopSpeed', min: 0.05, max: 2, step: 0.05, get: (p) => p.settle.stopSpeed, set: (p, v) => { p.settle.stopSpeed = v; } },
  { section: 'SETTLE', label: 'stopDurationMs', min: 50, max: 600, step: 10, get: (p) => p.settle.stopDurationMs, set: (p, v) => { p.settle.stopDurationMs = v; } },
  { section: 'SETTLE', label: 'resolveDisplayMs', min: 200, max: 3000, step: 50, get: (p) => p.settle.resolveDisplayMs, set: (p, v) => { p.settle.resolveDisplayMs = v; } },
  { section: 'RULE', label: 'captureThreshold', min: 0.2, max: 0.9, step: 0.05, get: (p) => p.rule.captureThreshold, set: (p, v) => { p.rule.captureThreshold = v; } },
  { section: 'BOARD', label: 'targetMinGap', min: 0, max: 120, step: 5, get: (p) => p.board.targetMinGap, set: (p, v) => { p.board.targetMinGap = v; } },
];

export interface DebugPanel {
  /** 直前の投擲の推定値を表示する */
  showEstimate(e: FlickEstimate | null): void;
  setSeed(seed: number): void;
  dispose(): void;
}

export interface DebugPanelHandlers {
  onChange(p: GameParams): void;
  onReseed(): void;
}

/** localStorage に保存されたパラメータを読み込む（壊れていれば既定値を返す） */
export function loadStoredParams(base: GameParams): GameParams {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Record<keyof GameParams, unknown>>;
    const merged = structuredClone(base);
    // セクション単位で浅くマージする（未知のキーは無視される）
    for (const key of Object.keys(base) as (keyof GameParams)[]) {
      const incoming = parsed[key];
      if (incoming && typeof incoming === 'object') {
        Object.assign(merged[key] as object, incoming);
      }
    }
    return merged;
  } catch {
    // プライベートモードや破損データでは既定値で続行する
    return base;
  }
}

function saveParams(p: GameParams): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // プライベートモード等で書けなくても致命的ではない
  }
}

export function clearStoredParams(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 無視
  }
}

export function createDebugPanel(
  params: GameParams,
  handlers: DebugPanelHandlers,
): DebugPanel {
  const root = document.createElement('div');
  // 盤面を隠さないよう、初期状態は折りたたみ。ヘッダのタップで開閉する。
  root.className = 'debug-panel collapsed';

  const header = document.createElement('div');
  header.className = 'debug-header';
  header.textContent = 'DEBUG ▸';
  header.setAttribute('role', 'button');
  root.appendChild(header);

  const body = document.createElement('div');
  body.className = 'debug-body';
  root.appendChild(body);

  header.addEventListener('click', () => {
    const collapsed = root.classList.toggle('collapsed');
    header.textContent = collapsed ? 'DEBUG ▸' : 'DEBUG ▾';
  });

  let lastSection = '';
  const valueLabels: { def: SliderDef; el: HTMLSpanElement; input: HTMLInputElement }[] = [];

  for (const def of SLIDERS) {
    if (def.section !== lastSection) {
      const h = document.createElement('div');
      h.className = 'debug-section';
      h.textContent = def.section;
      body.appendChild(h);
      lastSection = def.section;
    }

    const row = document.createElement('label');
    row.className = 'debug-row';

    const name = document.createElement('span');
    name.className = 'debug-name';
    name.textContent = def.label;

    const value = document.createElement('span');
    value.className = 'debug-value';
    value.textContent = String(def.get(params));

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(def.min);
    input.max = String(def.max);
    input.step = String(def.step);
    input.value = String(def.get(params));

    input.addEventListener('input', () => {
      const v = Number(input.value);
      def.set(params, v);
      value.textContent = String(v);
      saveParams(params);
      handlers.onChange(params);
    });

    row.append(name, value, input);
    body.appendChild(row);
    valueLabels.push({ def, el: value, input });
  }

  const estSection = document.createElement('div');
  estSection.className = 'debug-section';
  estSection.textContent = 'LAST THROW';
  body.appendChild(estSection);

  const est = document.createElement('pre');
  est.className = 'debug-est';
  est.textContent = '—';
  body.appendChild(est);

  const seedSection = document.createElement('div');
  seedSection.className = 'debug-section';
  seedSection.textContent = 'SEED';
  body.appendChild(seedSection);

  const seedLine = document.createElement('div');
  seedLine.className = 'debug-est';
  seedLine.textContent = '—';
  body.appendChild(seedLine);

  const buttons = document.createElement('div');
  buttons.className = 'debug-buttons';

  const mkButton = (label: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  };

  let currentSeed = 0;

  buttons.append(
    mkButton('Copy URL', () => {
      const url = new URL(window.location.href);
      url.searchParams.set('seed', String(currentSeed));
      url.searchParams.set('debug', '1');
      void navigator.clipboard?.writeText(url.toString());
    }),
    mkButton('Reseed', () => handlers.onReseed()),
    mkButton('Copy JSON', () => {
      void navigator.clipboard?.writeText(JSON.stringify(params, null, 2));
    }),
    mkButton('Reset', () => {
      clearStoredParams();
      window.location.reload();
    }),
  );
  body.appendChild(buttons);

  // パネル上のポインタ操作がゲームの投擲として扱われないようにする
  for (const type of ['pointerdown', 'pointermove', 'pointerup'] as const) {
    root.addEventListener(type, (e) => e.stopPropagation());
  }

  document.body.appendChild(root);

  return {
    showEstimate(e) {
      if (!e) {
        est.textContent = 'no throw (below min or too few samples)';
        return;
      }
      const speed = Math.hypot(e.velocity.x, e.velocity.y);
      est.textContent = [
        `finger  ${e.fingerSpeed.toFixed(2)} px/ms`,
        `regress ${e.regressSpeed.toFixed(2)}`,
        `peak    ${e.peakSpeed.toFixed(2)}`,
        `launch  ${speed.toFixed(1)} ${e.clamped ? '(CLAMPED)' : '(ok)'}`,
      ].join('\n');
    },
    setSeed(seed) {
      currentSeed = seed;
      seedLine.textContent = String(seed);
    },
    dispose() {
      root.remove();
      valueLabels.length = 0;
    },
  };
}
