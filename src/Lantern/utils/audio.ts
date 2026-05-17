// Lantern audio — cheerful synth BGM + procedural SFX. Same public
// API as before (unlockAudio / playSfx / startBgm / stopBgm), so callers
// don't move. The drone-with-swell pattern got replaced by a 16-step
// pentatonic melody at 105 BPM with a bouncy synth arp, a warm sine bass,
// and a periodic bell tinkle — light "ice-rink Saturday" energy.

type SfxKey =
  | 'chirp_short' | 'chirp_help' | 'chirp_happy'
  | 'skua_cry'    | 'bonk'       | 'game_over';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bgmGain: GainNode | null = null;
let bgmFx: GainNode | null = null;
let bgmTimer: number | null = null;

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC: typeof AudioContext | undefined =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
  }
  return ctx;
}

export async function unlockAudio() {
  const c = ensureCtx();
  if (c && c.state === 'suspended') await c.resume();
}

// ---------- helpers ----------
function envelope(node: GainNode, peak: number, attack: number, decay: number, t0: number) {
  node.gain.setValueAtTime(0, t0);
  node.gain.linearRampToValueAtTime(peak, t0 + attack);
  node.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

function tone(freq: number, type: OscillatorType, dur: number, peak: number, t0: number, glideTo?: number, dst?: AudioNode) {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t0 + dur);
  envelope(g, peak, 0.01, dur, t0);
  osc.connect(g).connect(dst ?? master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, peak: number, t0: number, lp = 2000) {
  if (!ctx || !master) return;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = lp;
  const g = ctx.createGain();
  envelope(g, peak, 0.005, dur, t0);
  src.connect(filt).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

// ---------- SFX ----------
export function playSfx(key: SfxKey) {
  const c = ensureCtx();
  if (!c || !master) return;
  if (c.state === 'suspended') c.resume();
  const t = c.currentTime;
  switch (key) {
    case 'chirp_short':
      tone(1600, 'square', 0.08, 0.18, t, 1300);
      tone(2100, 'square', 0.06, 0.10, t + 0.02, 1700);
      break;
    case 'chirp_help':
      tone(900, 'sawtooth', 0.18, 0.16, t, 600);
      tone(1100, 'triangle', 0.16, 0.10, t + 0.06, 750);
      break;
    case 'chirp_happy':
      tone(1400, 'square', 0.08, 0.16, t, 1900);
      tone(1900, 'square', 0.08, 0.16, t + 0.10, 2300);
      break;
    case 'skua_cry':
      tone(1800, 'square', 0.08, 0.18, t,        1400);
      tone(1400, 'square', 0.18, 0.22, t + 0.06,  800);
      tone( 900, 'sawtooth', 0.14, 0.16, t + 0.18, 600);
      noise(0.20, 0.05, t + 0.02, 4000);
      break;
    case 'bonk':
      tone(140, 'sine', 0.22, 0.35, t, 50);
      noise(0.18, 0.20, t, 1500);
      break;
    case 'game_over':
      tone(660, 'triangle', 0.30, 0.22, t,          440);
      tone(440, 'triangle', 0.30, 0.22, t + 0.20,   330);
      tone(330, 'triangle', 0.45, 0.22, t + 0.40,   180);
      break;
  }
}

// ---------- BGM ----------
//
// 105 BPM, 16th-note grid, 16-step phrase (one bar). Four voices:
//   • Lead       — triangle, pentatonic melody, walks across the phrase
//   • Arp        — square, bouncy 8th-note arpeggio (high octave)
//   • Bass       — sine pulse on beats 1, 5, 9, 13 with a subtle pitch drop
//   • Bell       — high triangle ping every 4 beats (icy sparkle)
//
// Key: D major pentatonic — D E F# A B. Cheerful but not sugary.
// Subtle short-delay feedback bus glues the voices into one room.

const BGM_BPM = 105;
const STEP_T = 60 / BGM_BPM / 4;           // 16th-note duration
const BAR = 16;                            // 16 16ths per bar
const PHRASE_BARS = 4;                     // melody varies across 4 bars

// Semitone offsets from D2 (root). D major pentatonic = 0, 2, 4, 7, 9.
const ROOT_MIDI = 38;                      // D2

// Lead melody — 4 bars × 16 steps. -1 = rest. Values are semitones above D5.
const LEAD: number[] = [
  // bar 1  D  .  F# A  .  D  E  .  F# A  .  E  D  .  .  .
              0, -1, 4, 7, -1, 0, 2, -1, 4, 7, -1, 2, 0, -1, -1, -1,
  // bar 2  E  .  F# B  .  E  F# .  A  B  .  F# E  .  .  .
              2, -1, 4, 11, -1, 2, 4, -1, 7, 11, -1, 4, 2, -1, -1, -1,
  // bar 3  D  E  F# A  E  D  E  F# A  G  E  D  .  E  .  D
              0,  2, 4, 7, 2, 0, 2, 4, 7, -1, 2, 0, -1, 2, -1, 0,
  // bar 4  F# .  A  G  E  D  .  .  D  .  .  .  .  .  .  .
              4, -1, 7, -1, 2, 0, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1,
];
// Lead is in the upper octave (add 12 semitones when used).

// Arp — same length, pentatonic notes high above. Drives the bounce.
const ARP: number[] = [
  // octave 5 pentatonic spread, 8th-note shuffle
   12, 16, 19, 16,  12, 16, 19, 16,  14, 19, 21, 19,  14, 19, 21, 19,
   16, 19, 21, 19,  16, 19, 21, 23,  12, 19, 16, 19,  12, 14, 16, 19,
   12, 16, 19, 23,  19, 16, 12, 16,  14, 19, 16, 21,  19, 14, 12, 19,
   16, 14, 12, 16,  19, 14, 12, 19,  16, 14, 12, 14,  16, 19, 16, 12,
];

// Bass — root and IV alternating across the phrase
const BASS_PATTERN: { step: number; smOffset: number }[] = [
  // bar 1: I (D)
  { step: 0,  smOffset: 0 },  { step: 4,  smOffset: 0 },
  { step: 8,  smOffset: 0 },  { step: 12, smOffset: 0 },
  // bar 2: I
  { step: 16, smOffset: 0 },  { step: 20, smOffset: 0 },
  { step: 24, smOffset: 0 },  { step: 28, smOffset: 0 },
  // bar 3: IV (G)
  { step: 32, smOffset: 5 },  { step: 36, smOffset: 5 },
  { step: 40, smOffset: 5 },  { step: 44, smOffset: 5 },
  // bar 4: I → V resolution
  { step: 48, smOffset: 0 },  { step: 52, smOffset: 0 },
  { step: 56, smOffset: 7 },  { step: 60, smOffset: 0 },
];

let bgmRunning = false;
let bgmNextStepT = 0;
let bgmStep = 0;
let bgmPeak = 0.07;

function midiToHz(sm: number): number {
  return 440 * Math.pow(2, (ROOT_MIDI + sm - 69) / 12);
}

function pluckTri(freq: number, t: number, dur: number, peak: number, dst?: AudioNode) {
  if (!ctx || !bgmGain) return;
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(freq, t);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g).connect(dst ?? bgmGain);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function pluckSquare(freq: number, t: number, dur: number, peak: number, dst?: AudioNode) {
  if (!ctx || !bgmGain) return;
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.setValueAtTime(freq, t);
  // gentle lowpass so the square doesn't bite
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 2400;
  filt.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(filt).connect(g).connect(dst ?? bgmGain);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function bassSine(freq: number, t: number, dur: number, peak: number) {
  if (!ctx || !bgmGain) return;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq * 1.04, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
  o.connect(g).connect(bgmGain);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function bellPing(freq: number, t: number, peak: number, dst?: AudioNode) {
  // Bell = stacked sine (fundamental + inharmonic 2.76 partial) with very
  // short attack and long exponential decay. Sounds icy and sparkly.
  if (!ctx || !bgmGain) return;
  const dest = dst ?? bgmGain;
  const o1 = ctx.createOscillator();
  o1.type = 'sine';
  o1.frequency.setValueAtTime(freq, t);
  const o2 = ctx.createOscillator();
  o2.type = 'sine';
  o2.frequency.setValueAtTime(freq * 2.76, t);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 1.2);
  const g2 = ctx.createGain();
  g2.gain.value = 0.35; // inharmonic partial quieter
  o1.connect(g);
  o2.connect(g2).connect(g);
  g.connect(dest);
  o1.start(t); o1.stop(t + 1.3);
  o2.start(t); o2.stop(t + 1.3);
}

function scheduleBgmAhead() {
  if (!ctx || !bgmRunning || !bgmGain || !bgmFx) return;
  const horizon = ctx.currentTime + 0.5;
  while (bgmNextStepT < horizon) {
    const stepInPhrase = bgmStep % (BAR * PHRASE_BARS);   // 0..63
    const stepInBar = bgmStep % BAR;                       // 0..15
    const t = bgmNextStepT;

    // LEAD — triangle melody, upper octave
    const lead = LEAD[stepInPhrase];
    if (lead >= 0) {
      pluckTri(midiToHz(lead + 24), t, STEP_T * 2.2, bgmPeak * 1.3);
      // soft echo via the FX bus
      pluckTri(midiToHz(lead + 24), t, STEP_T * 1.8, bgmPeak * 0.45, bgmFx);
    }

    // ARP — square 16ths, slightly quieter so it's a bed not a feature
    const arp = ARP[stepInPhrase];
    if (arp >= 0) {
      pluckSquare(midiToHz(arp + 24), t, STEP_T * 0.95, bgmPeak * 0.55);
    }

    // BASS — sine pulses per pattern
    const b = BASS_PATTERN.find(b => b.step === stepInPhrase);
    if (b) {
      bassSine(midiToHz(b.smOffset), t, STEP_T * 3.6, bgmPeak * 1.1);
    }

    // BELL — high tinkle on beat 1 of every bar (steps 0/16/32/48) AND a
    // softer tinkle on beat 3 of every other bar
    if (stepInBar === 0) {
      const noteSm = stepInPhrase === 0 ? 36 : 31; // D6 or A5
      bellPing(midiToHz(noteSm), t, bgmPeak * 0.65);
    } else if (stepInBar === 8 && (stepInPhrase === 8 || stepInPhrase === 40)) {
      bellPing(midiToHz(33), t, bgmPeak * 0.45);
    }

    bgmNextStepT += STEP_T;
    bgmStep++;
  }
}

export function startBgm(volume = 0.07) {
  const c = ensureCtx();
  if (!c || !master) return;
  if (c.state === 'suspended') c.resume();
  stopBgm();

  bgmGain = c.createGain();
  bgmGain.gain.value = 0;
  bgmGain.connect(master);
  bgmGain.gain.linearRampToValueAtTime(volume, c.currentTime + 1.2);

  // Small feedback delay bus — gives the lead a "rink reverb" tail without
  // shipping any audio files. Subtle so the melody stays clear.
  bgmFx = c.createGain();
  const delay = c.createDelay(0.6);
  delay.delayTime.value = 0.21;
  const fb = c.createGain();
  fb.gain.value = 0.30;
  const wet = c.createGain();
  wet.gain.value = 0.55;
  bgmFx.connect(delay);
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(wet);
  wet.connect(bgmGain);

  bgmPeak = volume;
  bgmRunning = true;
  bgmStep = 0;
  bgmNextStepT = c.currentTime + 0.05;

  bgmTimer = window.setInterval(() => scheduleBgmAhead(), 220) as unknown as number;
  scheduleBgmAhead();
}

export function stopBgm() {
  bgmRunning = false;
  if (bgmTimer !== null) { window.clearInterval(bgmTimer); bgmTimer = null; }
  if (bgmGain && ctx) {
    bgmGain.gain.cancelScheduledValues(ctx.currentTime);
    bgmGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
    const g = bgmGain;
    const fx = bgmFx;
    setTimeout(() => {
      g.disconnect();
      if (fx) fx.disconnect();
    }, 700);
    bgmGain = null;
    bgmFx = null;
  }
}
