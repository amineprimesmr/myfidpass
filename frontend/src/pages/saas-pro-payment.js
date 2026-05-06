import { createElement } from "react";
import { createRoot } from "react-dom/client";
import SaasProPaymentPage from "../features/SaasProPaymentPage.jsx";
import "../saas-pro-payment-page.css";
import "../saas-liquid-glass-billing.css";

let root;

export default {
  init() {
    const el = document.getElementById("saas-pro-payment-app");
    if (!el) return;
    el.classList.remove("hidden");
    el.setAttribute("aria-hidden", "false");
    if (!root) root = createRoot(el);
    root.render(createElement(SaasProPaymentPage));
  },
};
