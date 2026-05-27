// Card sound effects. Synthesized with WebAudio so no asset files are required.

let ctx: AudioContext | null = null;
let enabled = true;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  const Ctor: typeof AudioContext | undefined =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  try { ctx = new Ctor(); } catch { ctx = null; }
  return ctx;
}

// First user interaction can resume a suspended context (autoplay policies).
function resumeIfNeeded(c: AudioContext) {
  if (c.state === 'suspended') c.resume().catch(() => {});
}

export function setSoundEnabled(v: boolean) {
  enabled = v;
}

export function isSoundEnabled(): boolean {
  return enabled;
}

// Generic short envelope tone.
function tone(opts: {
  freq: number;
  freqEnd?: number;
  type?: OscillatorType;
  duration?: number;
  gain?: number;
  delay?: number;
}) {
  if (!enabled) return;
  const c = getCtx();
  if (!c) return;
  resumeIfNeeded(c);

  const t0 = c.currentTime + (opts.delay ?? 0);
  const dur = opts.duration ?? 0.12;
  const peak = opts.gain ?? 0.18;

  const osc = c.createOscillator();
  osc.type = opts.type ?? 'triangle';
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, opts.freqEnd), t0 + dur);
  }

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// Quick noise burst — sounds like a card slap.
function noiseBurst(opts: { duration?: number; gain?: number; delay?: number } = {}) {
  if (!enabled) return;
  const c = getCtx();
  if (!c) return;
  resumeIfNeeded(c);

  const t0 = c.currentTime + (opts.delay ?? 0);
  const dur = opts.duration ?? 0.07;
  const peak = opts.gain ?? 0.12;

  const buffer = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / data.length;
    data[i] = (Math.random() * 2 - 1) * (1 - t);
  }
  const src = c.createBufferSource();
  src.buffer = buffer;

  const g = c.createGain();
  g.gain.setValueAtTime(peak, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 800;

  src.connect(hp).connect(g).connect(c.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

// Play sound — a snap (placing a card on the table).
export function playCardPlace() {
  noiseBurst({ duration: 0.07, gain: 0.18 });
  tone({ freq: 520, freqEnd: 260, type: 'triangle', duration: 0.12, gain: 0.12 });
}

// Draw sound — a softer flick.
export function playCardDraw() {
  noiseBurst({ duration: 0.05, gain: 0.12 });
  tone({ freq: 380, freqEnd: 720, type: 'sine', duration: 0.1, gain: 0.08 });
}
