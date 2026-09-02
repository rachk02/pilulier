/* ============================================================================
   sound.js — sonneries d'alarme generees en direct (Web Audio).
   Aucun fichier .mp3 : rien a telecharger, rien a mettre en cache, et la
   sonnerie reste identique hors-ligne.
   ========================================================================== */

let ctx = null;
let current = null;          // { stop() }
let unlocked = false;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Android/iOS exigent un geste utilisateur avant tout son : a appeler au 1er tap. */
export function unlockAudio() {
  if (unlocked) return;
  try {
    const c = ac();
    const b = c.createBuffer(1, 1, 22050);
    const s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0);
    unlocked = true;
  } catch { /* ignore */ }
}

/* --------------------------------------------------------------- Notes */
const N = { C4:261.63, D4:293.66, E4:329.63, F4:349.23, G4:392.00, A4:440.00, B4:493.88,
            C5:523.25, D5:587.33, E5:659.25, F5:698.46, G5:783.99, A5:880.00, B5:987.77,
            C6:1046.50, D6:1174.66, E6:1318.51, G6:1567.98 };

/**
 * Une note = [frequence, debut (s), duree (s), timbre, volume]
 * Chaque sonnerie renvoie { notes, loop } : loop = duree d'un cycle complet.
 */
export const RINGTONES = {
  carillon: {
    label: 'Carillon', desc: 'Trois notes cristallines, douces mais nettes.', loop: 3.2, wave: 'sine',
    notes: [[N.E5,0,1.1],[N.C5,.42,1.2],[N.G5,.84,1.6],[N.C6,1.26,2.0]],
  },
  goutte: {
    label: 'Goutte', desc: 'Petites gouttes rondes, façon marimba.', loop: 2.4, wave: 'triangle',
    notes: [[N.A5,0,.34],[N.E5,.22,.34],[N.A4,.44,.5],[N.E5,1.2,.34],[N.A5,1.42,.6]],
  },
  kora: {
    label: 'Kora', desc: 'Arpège pentatonique chaleureux, comme une corde pincée.', loop: 3.6, wave: 'triangle',
    notes: [[N.D5,0,.6],[N.F5,.2,.6],[N.A5,.4,.7],[N.C6,.6,.9],[N.A5,1.1,.7],[N.F5,1.4,.8],
            [N.D5,1.8,1.2],[N.A4,2.2,1.4]],
  },
  douce: {
    label: 'Douce', desc: 'Nappe très calme, pour la nuit.', loop: 5.0, wave: 'sine',
    notes: [[N.C4,0,2.6,.16],[N.G4,.3,2.6,.14],[N.E5,.6,2.8,.10],[N.C5,2.6,2.4,.12]],
  },
  reveil: {
    label: 'Réveil', desc: 'Bips insistants — impossible à ignorer.', loop: 2.0, wave: 'square',
    notes: [[N.A5,0,.13,.30],[N.A5,.2,.13,.30],[N.A5,.4,.13,.30],
            [N.E5,.7,.13,.30],[N.E5,.9,.13,.30],[N.E5,1.1,.2,.30]],
  },
  urgence: {
    label: 'Urgence', desc: 'Sirène montante, pour les prises à ne jamais rater.', loop: 1.8, wave: 'sawtooth',
    notes: [[N.C5,0,.42,.22],[N.G5,.4,.42,.22],[N.C6,.8,.5,.24],[N.G5,1.25,.3,.18]],
  },
};
export const RINGTONE_LIST = Object.entries(RINGTONES).map(([id, r]) => ({ id, ...r }));

/* -------------------------------------------------------------- Lecture */
function playNote(c, out, [freq, at, dur, vol = 0.22], wave, t0) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = wave; osc.frequency.value = freq;
  const start = t0 + at;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g); g.connect(out);
  osc.start(start); osc.stop(start + dur + 0.05);
}

/**
 * Joue une sonnerie.
 * @param {string} id   cle de RINGTONES
 * @param {object} opt  { loops:number|Infinity, volume:0..1 }
 * @returns {{stop:Function}}
 */
export function playRingtone(id, opt = {}) {
  stopRingtone();
  const r = RINGTONES[id] || RINGTONES.carillon;
  const volume = opt.volume ?? 0.8;
  const loops = opt.loops ?? 1;
  let c;
  try { c = ac(); } catch { return { stop() {} }; }

  const master = c.createGain();
  master.gain.value = volume;
  master.connect(c.destination);

  let cycle = 0, timer = null, stopped = false;
  const fire = () => {
    if (stopped) return;
    const t0 = c.currentTime + 0.03;
    for (const n of r.notes) playNote(c, master, n, r.wave, t0);
    cycle++;
    if (loops === Infinity || cycle < loops) timer = setTimeout(fire, r.loop * 1000);
    else current = null;
  };
  fire();

  const handle = {
    stop() {
      stopped = true; clearTimeout(timer);
      try {
        master.gain.setTargetAtTime(0.0001, c.currentTime, 0.04);
        setTimeout(() => { try { master.disconnect(); } catch {} }, 400);
      } catch {}
      if (current === handle) current = null;
    },
  };
  current = handle;
  return handle;
}

export function stopRingtone() { if (current) current.stop(); current = null; }
export const isRinging = () => !!current;

/* --------------------------------------------------- Retours haptiques */
export const VIBES = {
  tap:     [8],
  ok:      [14, 40, 22],
  warn:    [30, 60, 30],
  alarm:   [420, 220, 420, 220, 620],
  error:   [60, 50, 60],
};
/* Le navigateur refuse de vibrer avant le premier geste de l'utilisateur et
   ecrit une erreur dans la console. On attend donc ce geste. */
let hasGesture = false;
const markGesture = () => { hasGesture = true; };
addEventListener('pointerdown', markGesture, { once: true, passive: true });
addEventListener('keydown', markGesture, { once: true });
addEventListener('touchstart', markGesture, { once: true, passive: true });

export function vibrate(pattern = 'tap', enabled = true) {
  if (!enabled || !hasGesture || !navigator.vibrate) return;
  try { navigator.vibrate(VIBES[pattern] || pattern); } catch {}
}
export function stopVibrate() { try { navigator.vibrate?.(0); } catch {} }

/** Petit clic d'interface (discret, non configurable). */
export function blip(volume = 0.12) {
  try {
    const c = ac(), t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(1320, t + 0.06);
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.14);
  } catch {}
}
