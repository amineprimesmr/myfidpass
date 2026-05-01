import { getSeoContentPageHtml } from "../features/seo-content-pages.js";

const legalContent = () => document.getElementById("landing-legal-content");

export default {
  init(route) {
    const slug = String(route?.page || "").trim();
    const html = getSeoContentPageHtml(slug);
    const el = legalContent();
    if (el && html) el.innerHTML = html;
  },
};
