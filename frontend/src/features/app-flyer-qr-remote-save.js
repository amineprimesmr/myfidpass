/**
 * Queue de sauvegarde distante (debounce + sérialisation).
 */

/**
 * @param {{ delayMs?: number; run: () => Promise<unknown> }} opts
 */
export function createRemoteSaveQueue(opts) {
  const delayMs = Number.isFinite(Number(opts?.delayMs)) ? Math.max(100, Number(opts.delayMs)) : 2000;
  const run = typeof opts?.run === "function" ? opts.run : async () => {};
  let timer = null;
  let busy = false;
  let queued = false;

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      timer = null;
      if (busy) {
        queued = true;
        return;
      }
      busy = true;
      try {
        await run();
      } finally {
        busy = false;
        if (queued) {
          queued = false;
          schedule();
        }
      }
    }, delayMs);
  }

  return { schedule };
}
