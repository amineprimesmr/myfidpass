let disposeLanding = null;

export function setLiquidGlassMenuDisposeLanding(d) {
  disposeLanding = typeof d === "function" ? d : null;
}

export function runLiquidGlassMenuCleanupLanding() {
  if (disposeLanding) {
    disposeLanding();
    disposeLanding = null;
  }
}
