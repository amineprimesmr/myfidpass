import { getContactPageHtml } from "../features/contact-page.js";

const contentEl = () => document.getElementById("landing-legal-content");

const topicLabels = {
  commerce: "Commerçant — support MyFidPass",
  client: "Client — carte / Wallet / points",
  partenariat: "Partenariat ou presse",
  autre: "Autre demande",
};

function wireContactForm() {
  const form = document.getElementById("contact-page-form");
  const errEl = document.getElementById("contact-page-form-error");
  if (!form || form.tagName !== "FORM") return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (errEl) {
      errEl.textContent = "";
      errEl.classList.add("hidden");
    }
    const fd = new FormData(form);
    const email = String(fd.get("email") || "").trim();
    const name = String(fd.get("name") || "").trim();
    const topic = String(fd.get("topic") || "autre");
    const message = String(fd.get("message") || "").trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (errEl) {
        errEl.textContent = "Indiquez une adresse e-mail valide.";
        errEl.classList.remove("hidden");
      }
      return;
    }
    if (!message) {
      if (errEl) {
        errEl.textContent = "Écrivez un court message.";
        errEl.classList.remove("hidden");
      }
      return;
    }

    const subject = topicLabels[topic] || topicLabels.autre;
    const lines = [
      "— Message envoyé depuis myfidpass.fr/contact —",
      "",
      name ? `Nom : ${name}` : null,
      `E-mail de réponse : ${email}`,
      "",
      message,
    ].filter(Boolean);
    const body = lines.join("\n");
    const href = `mailto:contact@myfidpass.fr?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
  });
}

export default {
  init(_route) {
    const el = contentEl();
    if (el) el.innerHTML = getContactPageHtml();
    wireContactForm();
  },
};
