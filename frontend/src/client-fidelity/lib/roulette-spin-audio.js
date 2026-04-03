/**
 * Bruitage roue (Web Audio) — déclenché dans le geste utilisateur (clic « Jouer »).
 * @param {number} durationMs durée prévue de l’animation (pour cohérence ; le stop est manuel)
 * @returns {Promise<{ stop: () => void }>}
 */
export async function startRouletteSpinSound(durationMs) {
  void durationMs;
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
  master.gain.value = 0.11;
  master.connect(ctx.destination);

  const bufferSize = Math.floor(ctx.sampleRate * 1.2);
  const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;

  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 380;
  bp.Q.value = 0.65;

  const rumble = ctx.createOscillator();
  rumble.type = "sine";
  rumble.frequency.value = 58;

  const rumbleGain = ctx.createGain();
  rumbleGain.gain.value = 0.038;
  rumble.connect(rumbleGain);
  rumbleGain.connect(master);

  noise.connect(bp);
  bp.connect(master);

  const mod = ctx.createOscillator();
  mod.type = "sine";
  mod.frequency.value = 2.4;
  const modGain = ctx.createGain();
  modGain.gain.value = 120;
  mod.connect(modGain);
  modGain.connect(bp.frequency);

  rumble.start();
  noise.start();
  mod.start();

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    const t = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    } catch (_) {
      try {
        master.gain.value = 0;
      } catch (_) {}
    }
    window.setTimeout(() => {
      try {
        noise.stop();
        rumble.stop();
        mod.stop();
      } catch (_) {}
      try {
        ctx.close();
      } catch (_) {}
    }, 600);
  };

  return { stop };
  } catch (_) {
    try {
      ctx.close();
    } catch (_) {}
    return { stop: () => {} };
  }
}
