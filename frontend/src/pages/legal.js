import { getLegalPageHtml } from "../features/legal.js";

const legalContent = () => document.getElementById("landing-legal-content");

export default {
  init(route) {
    const html = getLegalPageHtml(route.page);
    const el = legalContent();
    if (el && html) el.innerHTML = html;
  },
};
