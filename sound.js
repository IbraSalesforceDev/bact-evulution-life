/* =====================================================================
   sound.js — Efectos de sonido sintetizados con la Web Audio API.

   No usa ningún archivo de audio: todos los sonidos se generan por
   código (osciladores y ruido), así el juego sigue siendo ligero y
   funciona sin conexión. Los navegadores exigen un gesto del usuario
   para arrancar el audio, por eso se llama a resume() en los clicks.
   ===================================================================== */

let ctx = null;
let master = null;
let muted = false;
const VOL = 0.5;

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : VOL;
    master.connect(ctx.destination);
  }
  return ctx;
}

export function resume() {
  const c = ac();
  if (c.state === "suspended") c.resume();
}

// Desbloqueo de audio para móviles (iOS/iPad): reanuda el contexto y
// reproduce un sonido inaudible para que el navegador habilite el audio.
export function unlock() {
  const c = ac();
  if (c.state === "suspended") c.resume();
  const b = c.createBuffer(1, 1, c.sampleRate);
  const s = c.createBufferSource();
  s.buffer = b; s.connect(master); s.start(0);
}

// Tono ascendente de arranque: confirmación inmediata de que hay sonido.
export function startTone() {
  if (muted) return;
  const c = ac(), t = c.currentTime;
  const o = c.createOscillator(); o.type = "triangle";
  o.frequency.setValueAtTime(220, t);
  o.frequency.exponentialRampToValueAtTime(660, t + 0.3);
  const g = c.createGain(); shape(g, t, 0.4, 0.02, 0.4);
  o.connect(g).connect(master); o.start(t); o.stop(t + 0.45);
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : VOL;
}
export function isMuted() { return muted; }

function noiseBuffer(c, dur) {
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// Envolvente exponencial sencilla: silencio -> pico -> silencio.
function shape(g, t0, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

// ---- Meteorito: silbido descendente + golpe grave. ----
export function meteor() {
  if (muted) return;
  const c = ac(), t = c.currentTime;
  const src = c.createBufferSource(); src.buffer = noiseBuffer(c, 0.6);
  const lp = c.createBiquadFilter(); lp.type = "lowpass";
  lp.frequency.setValueAtTime(3200, t);
  lp.frequency.exponentialRampToValueAtTime(300, t + 0.5);
  const g = c.createGain(); shape(g, t, 0.45, 0.01, 0.55);
  src.connect(lp).connect(g).connect(master); src.start(t); src.stop(t + 0.7);

  const o = c.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(50, t + 0.4);
  const g2 = c.createGain(); shape(g2, t, 0.55, 0.005, 0.45);
  o.connect(g2).connect(master); o.start(t); o.stop(t + 0.5);
}

// ---- Volcán: retumbo grave que crece. ----
export function volcano() {
  if (muted) return;
  const c = ac(), t = c.currentTime;
  const src = c.createBufferSource(); src.buffer = noiseBuffer(c, 1.4);
  const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 180;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.35);
  src.connect(lp).connect(g).connect(master); src.start(t); src.stop(t + 1.4);
}

// ---- Choque de planeta: bombazo profundo y largo. ----
export function collision() {
  if (muted) return;
  const c = ac(), t = c.currentTime;
  const o = c.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(95, t);
  o.frequency.exponentialRampToValueAtTime(28, t + 1.3);
  const g = c.createGain(); shape(g, t, 0.9, 0.02, 1.5);
  o.connect(g).connect(master); o.start(t); o.stop(t + 1.7);

  const src = c.createBufferSource(); src.buffer = noiseBuffer(c, 1.2);
  const lp = c.createBiquadFilter(); lp.type = "lowpass";
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.exponentialRampToValueAtTime(120, t + 1.0);
  const g2 = c.createGain(); shape(g2, t, 0.6, 0.03, 1.15);
  src.connect(lp).connect(g2).connect(master); src.start(t); src.stop(t + 1.3);
}

// ---- Supernova: estallido brillante que se expande. ----
export function supernova() {
  if (muted) return;
  const c = ac(), t = c.currentTime;
  const src = c.createBufferSource(); src.buffer = noiseBuffer(c, 2.2);
  const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 0.7;
  bp.frequency.setValueAtTime(400, t);
  bp.frequency.exponentialRampToValueAtTime(6500, t + 1.6);
  const g = c.createGain(); shape(g, t, 0.7, 0.8, 1.4);
  src.connect(bp).connect(g).connect(master); src.start(t); src.stop(t + 2.2);

  const o = c.createOscillator(); o.type = "sawtooth";
  o.frequency.setValueAtTime(220, t);
  o.frequency.exponentialRampToValueAtTime(880, t + 1.5);
  const g2 = c.createGain(); shape(g2, t, 0.22, 0.6, 1.4);
  o.connect(g2).connect(master); o.start(t); o.stop(t + 2.0);
}

// ---- Hito evolutivo: arpegio ascendente; más glorioso cuanto más alto. ----
export function milestone(level) {
  if (muted) return;
  const c = ac(), t = c.currentTime;
  const root = 261.63 * Math.pow(2, (level - 1) / 12); // sube con la etapa
  const steps = level >= 7 ? [0, 4, 7, 12, 16]
              : level >= 6 ? [0, 4, 7, 12]
              : [0, 4, 7];
  steps.forEach((semi, i) => {
    const o = c.createOscillator(); o.type = "triangle";
    o.frequency.value = root * Math.pow(2, semi / 12);
    const g = c.createGain(); const st = t + i * 0.10;
    g.gain.setValueAtTime(0.0001, st);
    g.gain.exponentialRampToValueAtTime(0.33, st + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, st + 0.55);
    o.connect(g).connect(master); o.start(st); o.stop(st + 0.6);
  });
}

// ---- Click de interfaz. ----
export function click() {
  if (muted) return;
  const c = ac(), t = c.currentTime;
  const o = c.createOscillator(); o.type = "square"; o.frequency.value = 620;
  const g = c.createGain(); shape(g, t, 0.10, 0.005, 0.07);
  o.connect(g).connect(master); o.start(t); o.stop(t + 0.1);
}
