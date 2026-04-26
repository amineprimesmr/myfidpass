import "../liquid-glass-test.css";

/** Démonstration complète kube.io (SVG) — `public/vendor/kube-liquid-glass/`. */
const IFRAME_SRC = "/vendor/kube-liquid-glass/index.html";

export default {
  init() {
    const iframe = document.querySelector("#liquid-glass-test-app .liquid-glass-test-iframe");
    if (iframe) {
      iframe.src = `${IFRAME_SRC}?t=${Date.now()}`;
    }
  },
};
