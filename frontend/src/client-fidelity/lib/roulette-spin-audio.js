/**
 * Bruitage roue type casino : clics mécaniques (tic-tic) dont l’espacement ralentit,
 * proche d’une roue qui freine. Web Audio, déclenché au geste utilisateur.
 * @param {number} durationMs durée de l’animation de rotation (alignement visuel)
 * @returns {Promise<{ stop: () => void }>}
 */
export async function startRouletteSpinSound(durationMs) {
  const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (typeof Ctx !== "function") {
    return { stop: () => {} };
  }

  let ctx;
  try {
    ctx = new Ctx();
    await ctx.resume();
  } catch (_) {
    return { stop: () => {} };
  }

  try {
    const master = ctx.createGain();
    master.gain.value = 0.17;
    master.connect(ctx.destination);

    const sr = ctx.sampleRate;
    const clickBuf = createRouletteClickBuffer(ctx, sr);
    const durSec = Math.max(0.35, Math.min(20, Number(durationMs) / 1000 || 6));

    /** Espacement entre deux tics (s) : rapide au début, puis ralentissement type roue */
    function spacingAtProgress(p) {
      const x = Math.min(1, Math.max(0, p));
      return 0.026 + x ** 1.55 * 0.34;
    }

    let tRel = 0;
    let tick = 0;
    while (tRel < durSec) {
      const p = tRel / durSec;
      const when = ctx.currentTime + tRel + 0.02;
      const intensity = 0.55 + (1 - p) * 0.45;
      scheduleClick(ctx, master, clickBuf, when, intensity, tick);
      tRel += spacingAtProgress(p) * (0.94 + Math.random() * 0.12);
      tick += 1;
    }

    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(master.gain.value, now);
        master.gain.exponentialRampToValueAtTime(0.0008, now + 0.12);
      } catch (_) {
        try {
          master.gain.value = 0;
        } catch (_) {}
      }
      window.setTimeout(() => {
        try {
          ctx.close();
        } catch (_) {}
      }, 400);
    };

    return { stop };
  } catch (_) {
    try {
      ctx.close();
    } catch (_) {}
    return { stop: () => {} };
  }
}

/**
 * Transitoire très court : attaque type frette / plot plastique.
 * @param {AudioContext} ctx
 * @param {number} sampleRate
 */
function createRouletteClickBuffer(ctx, sampleRate) {
  const len = Math.max(64, Math.floor(sampleRate * 0.038));
  const buf = ctx.createBuffer(1, len, sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const u = i / len;
    const env = Math.exp(-u * 22) * (1 - u * 0.35);
    ch[i] = (Math.random() * 2 - 1) * env;
  }
  return buf;
}

/**
 * @param {AudioContext} ctx
 * @param {GainNode} master
 * @param {AudioBuffer} clickBuf
 * @param {number} when
 * @param {number} intensity 0–1
 * @param {number} tickIndex pour léger jitter de hauteur
 */
function scheduleClick(ctx, master, clickBuf, when, intensity, tickIndex) {
  const src = ctx.createBufferSource();
  src.buffer = clickBuf;

  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 900 + (tickIndex % 5) * 40;
  hp.Q.value = 0.7;

  const bp = ctx.createBiquadFilter();
  bp.type = "peaking";
  bp.frequency.value = 2400 + (tickIndex % 7) * 55;
  bp.Q.value = 1.1;
  bp.gain.value = 6;

  const g = ctx.createGain();
  const peak = 0.095 * intensity;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(peak, when + 0.0008);
  g.gain.exponentialRampToValueAtTime(0.0006, when + 0.032);

  src.connect(hp);
  hp.connect(bp);
  bp.connect(g);
  g.connect(master);

  src.start(when);
  src.stop(when + 0.045);
}
