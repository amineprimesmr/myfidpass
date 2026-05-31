import { getGetAppPageHtml } from "../features/get-app-page.js";
import { mountGetAppPage } from "../features/get-app-mount.js";

const contentEl = () => document.getElementById("landing-legal-content");

export default {
  async init(_route) {
    const el = contentEl();
    if (el) el.innerHTML = getGetAppPageHtml();
    await mountGetAppPage();
  },
};
