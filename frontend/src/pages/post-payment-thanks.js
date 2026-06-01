import { getPostPaymentThanksHtml } from "../features/post-payment-thanks-page.js";
import {
  mountPostPaymentThanksPage,
  readPostPaymentRefsFromUrl,
} from "../features/post-payment-thanks-mount.js";

const contentEl = () => document.getElementById("landing-legal-content");

export default {
  async init(_route) {
    const el = contentEl();
    if (el) el.innerHTML = getPostPaymentThanksHtml();
    await mountPostPaymentThanksPage(readPostPaymentRefsFromUrl());
  },
};
