import { useState } from "react";
import { ScrollReveal } from "./ScrollReveal.jsx";
import {
  FINTAP_DEMO_EMAIL,
  FINTAP_DEMO_REASSURANCE,
  FINTAP_DEMO_TESTIMONIAL,
  FINTAP_DEMO_WHATSAPP_URL,
} from "./fintap-demo-request-config.js";
import "./fintap-demo-request.css";

const INITIAL_FORM = {
  business: "",
  name: "",
  phone: "",
  email: "",
  message: "",
};

function Stars({ count = 5 }) {
  return (
    <div className="fintap-demo__stars" aria-label={`${count} étoiles sur 5`}>
      {Array.from({ length: count }, (_, i) => (
        <svg
          key={i}
          className="fintap-demo__star"
          style={{ "--star-i": i }}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M12 2.5l2.86 5.79 6.39.93-4.62 4.51 1.09 6.36L12 17.9l-5.72 3.01 1.09-6.36L2.75 9.22l6.39-.93L12 2.5z"
          />
        </svg>
      ))}
    </div>
  );
}

function buildDemoMailto(form) {
  const subject = "Demande de démo Myfidpass";
  const body = [
    "— Demande de démo depuis myfidpass.fr —",
    "",
    `Commerce : ${form.business}`,
    `Nom : ${form.name}`,
    `Téléphone : ${form.phone}`,
    `E-mail : ${form.email}`,
    "",
    form.message.trim() || "(Pas de message complémentaire)",
  ].join("\n");
  return `mailto:${FINTAP_DEMO_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function buildWhatsAppHref(form) {
  const text = [
    "Bonjour, je souhaite une démo Myfidpass.",
    form.business.trim() ? `Commerce : ${form.business.trim()}` : null,
    form.name.trim() ? `Nom : ${form.name.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return `${FINTAP_DEMO_WHATSAPP_URL}?text=${encodeURIComponent(text)}`;
}

/** Demander une démo — formulaire + WhatsApp + réassurance. */
export function FinTapDemoRequestSection() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const onChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    if (error) setError("");
  };

  const validate = () => {
    if (!form.business.trim()) return "Indiquez le nom de votre commerce.";
    if (!form.name.trim()) return "Indiquez votre nom.";
    if (!form.phone.trim()) return "Indiquez un numéro pour vous rappeler.";
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return "Indiquez une adresse e-mail valide.";
    }
    return "";
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setSent(true);
    window.location.href = buildDemoMailto(form);
  };

  const whatsappHref = buildWhatsAppHref(form);

  return (
    <section
      className="fintap-demo"
      id="demo"
      aria-labelledby="fintap-demo-heading"
    >
      <div className="fintap-demo__inner">
        <div className="fintap-demo__layout">
          <ScrollReveal className="fintap-demo__aside" variant="slide-left">
            <p className="fintap-demo__eyebrow">On vous guide</p>
            <h2 id="fintap-demo-heading" className="fintap-demo__title">
              Demander une démo
            </h2>
            <p className="fintap-demo__lead">
              Voyez Myfidpass en action sur votre cas : carte Wallet, QR code, notifications et
              fidélisation — un conseiller vous rappelle rapidement.
            </p>
            <ul className="fintap-demo__pills">
              {FINTAP_DEMO_REASSURANCE.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <blockquote className="fintap-demo__quote">
              <Stars count={FINTAP_DEMO_TESTIMONIAL.rating} />
              <p>« {FINTAP_DEMO_TESTIMONIAL.quote} »</p>
              <footer>
                <cite>{FINTAP_DEMO_TESTIMONIAL.name}</cite>
                <span>{FINTAP_DEMO_TESTIMONIAL.role}</span>
              </footer>
            </blockquote>
          </ScrollReveal>

          <ScrollReveal className="fintap-demo__panel-wrap" variant="slide-right" delay={0.08}>
            <div className="fintap-demo__panel">
              <form className="fintap-demo__form" onSubmit={onSubmit} noValidate>
                <div className="fintap-demo__field">
                  <label htmlFor="fintap-demo-business">Nom du commerce</label>
                  <input
                    id="fintap-demo-business"
                    name="business"
                    type="text"
                    autoComplete="organization"
                    placeholder="Ex. Boulangerie du Centre"
                    value={form.business}
                    onChange={onChange("business")}
                    required
                  />
                </div>
                <div className="fintap-demo__row">
                  <div className="fintap-demo__field">
                    <label htmlFor="fintap-demo-name">Votre nom</label>
                    <input
                      id="fintap-demo-name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      placeholder="Prénom Nom"
                      value={form.name}
                      onChange={onChange("name")}
                      required
                    />
                  </div>
                  <div className="fintap-demo__field">
                    <label htmlFor="fintap-demo-phone">Téléphone</label>
                    <input
                      id="fintap-demo-phone"
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      placeholder="06 12 34 56 78"
                      value={form.phone}
                      onChange={onChange("phone")}
                      required
                    />
                  </div>
                </div>
                <div className="fintap-demo__field">
                  <label htmlFor="fintap-demo-email">E-mail</label>
                  <input
                    id="fintap-demo-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="vous@exemple.fr"
                    value={form.email}
                    onChange={onChange("email")}
                    required
                  />
                </div>
                <div className="fintap-demo__field">
                  <label htmlFor="fintap-demo-message">
                    Message <span className="fintap-demo__optional">(facultatif)</span>
                  </label>
                  <textarea
                    id="fintap-demo-message"
                    name="message"
                    rows={3}
                    placeholder="Créneau préféré, questions sur votre activité…"
                    value={form.message}
                    onChange={onChange("message")}
                  />
                </div>
                {error ? (
                  <p className="fintap-demo__error" role="alert">
                    {error}
                  </p>
                ) : null}
                {sent ? (
                  <p className="fintap-demo__success" role="status">
                    Votre messagerie va s&apos;ouvrir — envoyez le message pour confirmer la demande.
                  </p>
                ) : null}
                <button type="submit" className="fintap-demo__submit">
                  Demander ma démo
                </button>
              </form>
              <div className="fintap-demo__divider" aria-hidden="true">
                <span>ou</span>
              </div>
              <a
                href={whatsappHref}
                className="fintap-demo__whatsapp"
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Écrire sur WhatsApp
              </a>
              <p className="fintap-demo__footnote">
                Réponse garantie sous <strong>24 h ouvrées</strong>. Aucune carte bancaire requise pour la démo.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
