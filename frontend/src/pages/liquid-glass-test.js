import "../liquid-glass-test.css";

const IFRAME_SRC = "/liquid-glass-test.html";

export default {
  init() {
    const iframe = document.querySelector("#liquid-glass-test-app .liquid-glass-test-iframe");
    if (iframe) {
      iframe.src = `${IFRAME_SRC}?t=${Date.now()}`;
    }
  },
};
