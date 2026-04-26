let disposeLanding = null;
let disposeLgTest = null;

export function setLiquidGlassMenuDisposeLanding(d) {
  disposeLanding = typeof d === "function" ? d : null;
}

export function setLiquidGlassMenuDisposeTest(d) {
  disposeLgTest = typeof d === "function" ? d : null;
}

export function runLiquidGlassMenuCleanupLanding() {
  if (disposeLanding) {
    disposeLanding();
    disposeLanding = null;
  }
}

export function runLiquidGlassMenuCleanupTest() {
  if (disposeLgTest) {
    disposeLgTest();
    disposeLgTest = null;
  }
}
