import { useEffect, useMemo, useRef, useState } from "react";
import liquidGlassSwitcherFilters from "./liquid-glass-switcher-filters-fragment.html?raw";
import {
  ArrowLeft,
  Bell,
  Check,
  ChevronDown,
  Flame,
  LockKeyhole,
  Megaphone,
  Sparkles,
  Star,
  Wallet,
} from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { API_BASE, STRIPE_PUBLISHABLE_KEY, getAuthToken } from "../config.js";

const COUNTRIES = [
  { code: "FR", label: "France" },
  { code: "BE", label: "Belgique" },
  { code: "CH", label: "Suisse" },
  { code: "LU", label: "Luxembourg" },
  { code: "CA", label: "Canada" },
];
const HERO_IMG =
  "url(https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&w=1800&q=80)";
const AVA = [
  "https://i.pravatar.cc/96?img=12",
  "https://i.pravatar.cc/96?img=33",
  "https://i.pravatar.cc/96?img=47",
];
const BASE_COMPARE = [
  { name: "Carte fidélité Wallet", tag: "Apple & Google", value: "Illimité", Icon: Wallet },
  { name: "Membres et cartes suivis", tag: "Tableau de bord", value: "Illimité", Icon: Wallet },
  { name: "Notifications push", tag: "Campagnes & relances", value: "Illimité", Icon: Megaphone },
  { name: "Flyers de jeu & visuels", tag: "Export HD & partage", value: "Inclus", Icon: Sparkles },
];
const EXTRA_COMPARE = [
  { name: "Caisse & points", tag: "Scan QR & recherche client", value: "Inclus", Icon: Check },
  { name: "Missions avis & réseaux", tag: "Bonus points configurables", value: "Activable", Icon: Sparkles },
];

let stripePromise = null;
function getStripeInstance() {
  if (!STRIPE_PUBLISHABLE_KEY) return null;
  if (!stripePromise) stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
  return stripePromise;
}

function wireLiquidGlassTrackPrevious(switcherEl) {
  if (!switcherEl || switcherEl.dataset.liquidGlassTrackWired === "1") return;
  switcherEl.dataset.liquidGlassTrackWired = "1";
  const radios = switcherEl.querySelectorAll('input[type="radio"]');
  let previousValue = null;
  const initiallyChecked = switcherEl.querySelector('input[type="radio"]:checked');
  if (initiallyChecked) {
    previousValue = initiallyChecked.getAttribute("c-option");
    switcherEl.setAttribute("c-previous", previousValue);
  }
  radios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (radio.checked) {
        switcherEl.setAttribute("c-previous", previousValue ?? "");
        previousValue = radio.getAttribute("c-option");
      }
    });
  });
}

function formatDateFr(date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default function SaasProPaymentPage() {
  const isCheckoutRoute =
    typeof window !== "undefined" &&
    /^\/(?:paiement|offre-pro|abonnement-pro|plan-pro)\/checkout\/?$/i.test(window.location.pathname);
  const initialPlanAnnual = (() => {
    if (typeof window === "undefined") return true;
    const planParam = new URLSearchParams(window.location.search).get("plan");
    return String(planParam || "").toLowerCase() === "monthly" ? false : true;
  })();
  const [annual, setAnnual] = useState(initialPlanAnnual);
  const [expanded, setExpanded] = useState(false);
  const [country, setCountry] = useState("FR");
  const [saveCard, setSaveCard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmMode, setConfirmMode] = useState("payment");
  const [sessionReady, setSessionReady] = useState(false);
  const [elementsReady, setElementsReady] = useState(false);
  const [cardState, setCardState] = useState({
    number: false,
    expiry: false,
    cvc: false,
  });
  const [cardUi, setCardUi] = useState({
    numberEmpty: true,
    expiryEmpty: true,
    cvcEmpty: true,
    numberFocus: false,
    expiryFocus: false,
    cvcFocus: false,
  });

  const stripeRef = useRef(null);
  const elementsRef = useRef(null);
  const numberElementRef = useRef(null);
  const expiryElementRef = useRef(null);
  const cvcElementRef = useRef(null);
  const clientSecretRef = useRef("");
  const numberMountRef = useRef(null);
  const expiryMountRef = useRef(null);
  const cvcMountRef = useRef(null);
  const liquidGlassSwitcherRef = useRef(null);

  useEffect(() => {
    wireLiquidGlassTrackPrevious(liquidGlassSwitcherRef.current);
  }, [isCheckoutRoute]);

  useEffect(() => {
    if (!isCheckoutRoute) return;
    let cancelled = false;
    const setupEmbeddedCheckout = async () => {
      setInitializing(true);
      setError("");
      setSuccess("");
      setElementsReady(false);
      setSessionReady(false);
      try {
        const token = getAuthToken();
        if (!token) throw new Error("Connecte-toi avant de finaliser le paiement.");
        const stripePromiseLocal = getStripeInstance();
        if (!stripePromiseLocal) throw new Error("Stripe n'est pas configuré sur le frontend.");
        const stripe = await stripePromiseLocal;
        if (!stripe) throw new Error("Impossible de charger Stripe.");
        if (cancelled) return;
        stripeRef.current = stripe;

        const res = await fetch(`${API_BASE}/api/payment/create-embedded-subscription`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ plan: annual ? "annual" : "monthly", save_card: saveCard }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Impossible de préparer le paiement.");
        const clientSecret = String(data?.client_secret || "");
        const nextMode = String(data?.confirm_mode || "payment");
        if (!clientSecret) throw new Error("Client secret manquant.");
        if (cancelled) return;
        clientSecretRef.current = clientSecret;
        setConfirmMode(nextMode);

        try {
          numberElementRef.current?.destroy();
          expiryElementRef.current?.destroy();
          cvcElementRef.current?.destroy();
        } catch (_) {}

        const elements = stripe.elements({
          clientSecret,
          locale: "fr",
          appearance: {
            theme: "night",
            variables: {
              colorPrimary: "#09d670",
              colorText: "#f4f4f5",
              colorBackground: "#131821",
              colorDanger: "#ff6d7c",
              fontFamily: "Inter, system-ui, sans-serif",
            },
          },
        });
        elementsRef.current = elements;
        const baseStyle = {
          base: {
            color: "#f4f4f5",
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: "19px",
            "::placeholder": { color: "#6f7481" },
            iconColor: "#6f7481",
          },
        };
        const number = elements.create("cardNumber", {
          style: baseStyle,
          disableLink: true,
          placeholder: "1234 1234 1234 1234",
        });
        const expiry = elements.create("cardExpiry", {
          style: baseStyle,
          placeholder: "MM / AA",
        });
        const cvc = elements.create("cardCvc", {
          style: baseStyle,
          placeholder: "CVC",
        });
        number.on("change", (event) => {
          setCardState((s) => ({ ...s, number: !!event.complete }));
          setCardUi((s) => ({ ...s, numberEmpty: !!event.empty }));
          if (event?.error?.message) setError(event.error.message);
        });
        expiry.on("change", (event) => {
          setCardState((s) => ({ ...s, expiry: !!event.complete }));
          setCardUi((s) => ({ ...s, expiryEmpty: !!event.empty }));
          if (event?.error?.message) setError(event.error.message);
        });
        cvc.on("change", (event) => {
          setCardState((s) => ({ ...s, cvc: !!event.complete }));
          setCardUi((s) => ({ ...s, cvcEmpty: !!event.empty }));
          if (event?.error?.message) setError(event.error.message);
        });
        number.on("focus", () => setCardUi((s) => ({ ...s, numberFocus: true })));
        number.on("blur", () => setCardUi((s) => ({ ...s, numberFocus: false })));
        expiry.on("focus", () => setCardUi((s) => ({ ...s, expiryFocus: true })));
        expiry.on("blur", () => setCardUi((s) => ({ ...s, expiryFocus: false })));
        cvc.on("focus", () => setCardUi((s) => ({ ...s, cvcFocus: true })));
        cvc.on("blur", () => setCardUi((s) => ({ ...s, cvcFocus: false })));
        number.mount(numberMountRef.current);
        expiry.mount(expiryMountRef.current);
        cvc.mount(cvcMountRef.current);
        numberElementRef.current = number;
        expiryElementRef.current = expiry;
        cvcElementRef.current = cvc;
        setSessionReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Impossible de charger le module de paiement sécurisé.");
        }
      } finally {
        if (!cancelled) setInitializing(false);
      }
    };
    setupEmbeddedCheckout();
    return () => {
      cancelled = true;
      try {
        numberElementRef.current?.destroy();
        expiryElementRef.current?.destroy();
        cvcElementRef.current?.destroy();
      } catch (_) {}
    };
  }, [isCheckoutRoute, annual]);

  useEffect(() => {
    setElementsReady(Boolean(cardState.number && cardState.expiry && cardState.cvc));
  }, [cardState]);

  const totals = useMemo(
    () =>
      annual
        ? {
            planLabel: "Pro annuel",
            planAmount: "399,99€",
            promoLabel: "Économie annuelle",
            promoAmount: "2 mois offerts (vs mensuel)",
            totalToday: "399,99€",
          }
        : {
            planLabel: "Pro mensuel",
            planAmount: "49,99€",
            promoLabel: "Promo lancement (1er mois)",
            promoAmount: "-48,99€ (-98%)",
            totalToday: "1,00€",
          },
    [annual]
  );
  const billingTimeline = useMemo(() => {
    const now = new Date();
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    if (annual) {
      return [
        { title: "Aujourd’hui", subtitle: "Activation immédiate", amount: "399,99 €", icon: "check" },
        { title: "Toujours", subtitle: "Annulable à tout moment", amount: "Sans engagement", icon: "lock" },
      ];
    }
    return [
      { title: "Aujourd’hui", subtitle: "Offre lancement", amount: "1,00 €", icon: "check" },
      { title: formatDateFr(nextMonth), subtitle: "Facturation mensuelle", amount: "49,99 € /mois", icon: "lock" },
      { title: "Toujours", subtitle: "Annulable à tout moment", amount: "Sans engagement", icon: "star" },
    ];
  }, [annual]);

  const priceLine = annual
    ? { main: "399,99€", detail: "facturé annuellement" }
    : { main: "49,99€", detail: "par mois" };
  const compareRows = expanded ? [...BASE_COMPARE, ...EXTRA_COMPARE] : BASE_COMPARE;

  const handlePay = async () => {
    if (busy) return;
    setError("");
    setSuccess("");
    if (!sessionReady || !elementsReady || !stripeRef.current || !elementsRef.current) {
      setError("Le module de paiement n'est pas prêt. Recharge la page puis réessaie.");
      return;
    }
    if (!numberElementRef.current) {
      setError("Champ carte indisponible, recharge la page.");
      return;
    }
    setBusy(true);
    try {
      let confirmResult;
      if (confirmMode === "setup") {
        confirmResult = await stripeRef.current.confirmCardSetup(clientSecretRef.current, {
          payment_method: {
            card: numberElementRef.current,
            billing_details: {
              address: { country },
            },
          },
        });
      } else {
        confirmResult = await stripeRef.current.confirmCardPayment(clientSecretRef.current, {
          payment_method: {
            card: numberElementRef.current,
            billing_details: {
              address: { country },
            },
          },
        });
      }

      if (confirmResult?.error) throw new Error(confirmResult.error.message || "Paiement refusé.");

      setSuccess("Paiement validé. Activation du plan Pro en cours...");
      window.setTimeout(() => {
        window.location.href = "/app?subscription_paid=1";
      }, 900);
    } catch (err) {
      setError(err?.message || "Le paiement a échoué.");
    } finally {
      setBusy(false);
    }
  };

  if (!isCheckoutRoute) {
    return (
      <div className="saas-pay" style={{ "--saas-hero-img": HERO_IMG }}>
        <main className="saas-pay-main">
          <header className="saas-pay-hero" aria-labelledby="saas-pay-promo-heading">
            <div className="saas-pay-hero-bg" aria-hidden="true" />
            <div className="saas-pay-hero-bg-blur" aria-hidden="true" />
            <div className="saas-pay-hero-inner">
              <a className="saas-pay-back" href="/app" id="saas-pro-payment-back">
                <ArrowLeft size={16} strokeWidth={2.5} aria-hidden="true" />
                Retour
              </a>
              <div className="saas-pay-hero-promo">
                <p className="saas-pay-kicker">Offre spéciale</p>
                <h1 className="saas-pay-hero-off" id="saas-pay-promo-heading">
                  −30&nbsp;%
                </h1>
                <p className="saas-pay-hero-tag">Payez moins, fidélisez plus</p>
              </div>
            </div>
          </header>

          <section className="saas-pay-sheet" aria-label="Abonnement Pro MyFidPass">
            <h2 className="saas-pay-h1">Passez au plan Pro</h2>
            <p className="saas-pay-sub">
              Carte Wallet, caisse, notifications et campagnes&nbsp;: tout pour votre fidélité digitale avec MyFidPass.
            </p>
            <div className="saas-pay-trust">
              <div className="saas-pay-trust-avatars" aria-hidden="true">
                {AVA.map((src) => (
                  <img key={src} className="saas-pay-ava" src={src} alt="" width={38} height={38} loading="lazy" />
                ))}
              </div>
              <div className="saas-pay-trust-badge">Des commerces comme le vôtre nous font déjà confiance</div>
            </div>
            <div className="saas-pay-billing">
              <div className="saas-pay-billing-liquid">
                <fieldset ref={liquidGlassSwitcherRef} className="switcher">
                  <legend className="switcher__legend">Facturation mensuelle ou annuelle</legend>
                  <label className="switcher__option">
                    <input
                      className="switcher__input"
                      type="radio"
                      name="saasBillingPeriod"
                      value="monthly"
                      checked={!annual}
                      onChange={() => setAnnual(false)}
                      aria-label="Mensuel"
                      {...{ "c-option": "1" }}
                    />
                    <svg className="switcher__icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 36 36">
                      <path fill="var(--c)" fillRule="evenodd" d="M18 12a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" clipRule="evenodd" />
                      <path fill="var(--c)" d="M17 6.038a1 1 0 1 1 2 0v3a1 1 0 0 1-2 0v-3ZM24.244 7.742a1 1 0 1 1 1.618 1.176L24.1 11.345a1 1 0 1 1-1.618-1.176l1.763-2.427ZM29.104 13.379a1 1 0 0 1 .618 1.902l-2.854.927a1 1 0 1 1-.618-1.902l2.854-.927ZM29.722 20.795a1 1 0 0 1-.619 1.902l-2.853-.927a1 1 0 1 1 .618-1.902l2.854.927ZM25.862 27.159a1 1 0 0 1-1.618 1.175l-1.763-2.427a1 1 0 1 1 1.618-1.175l1.763 2.427ZM19 30.038a1 1 0 0 1-2 0v-3a1 1 0 1 1 2 0v3ZM11.755 28.334a1 1 0 0 1-1.618-1.175l1.764-2.427a1 1 0 1 1 1.618 1.175l-1.764 2.427ZM6.896 22.697a1 1 0 1 1-.618-1.902l2.853-.927a1 1 0 1 1 .618 1.902l-2.853.927ZM6.278 15.28a1 1 0 1 1 .618-1.901l2.853.927a1 1 0 1 1-.618 1.902l-2.853-.927ZM10.137 8.918a1 1 0 0 1 1.618-1.176l1.764 2.427a1 1 0 0 1-1.618 1.176l-1.764-2.427Z" />
                    </svg>
                  </label>
                  <label className="switcher__option">
                    <input
                      className="switcher__input"
                      type="radio"
                      name="saasBillingPeriod"
                      value="annual"
                      checked={annual}
                      onChange={() => setAnnual(true)}
                      aria-label="Annuel"
                      {...{ "c-option": "2" }}
                    />
                    <svg className="switcher__icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 36 36">
                      <path fill="var(--c)" d="M12.5 8.473a10.968 10.968 0 0 1 8.785-.97 7.435 7.435 0 0 0-3.737 4.672l-.09.373A7.454 7.454 0 0 0 28.732 20.4a10.97 10.97 0 0 1-5.232 7.125l-.497.27c-5.014 2.566-11.175.916-14.234-3.813l-.295-.483C5.53 18.403 7.13 11.93 12.017 8.77l.483-.297Zm4.234.616a8.946 8.946 0 0 0-2.805.883l-.429.234A9 9 0 0 0 10.206 22.5l.241.395A9 9 0 0 0 22.5 25.794l.416-.255a8.94 8.94 0 0 0 2.167-1.99 9.433 9.433 0 0 1-2.782-.313c-5.043-1.352-8.036-6.535-6.686-11.578l.147-.491c.242-.745.573-1.44.972-2.078Z" />
                    </svg>
                  </label>
                  <div dangerouslySetInnerHTML={{ __html: liquidGlassSwitcherFilters }} />
                </fieldset>
              </div>
              <span className="saas-pay-pill-off">−30&nbsp;%</span>
            </div>
            <div className="saas-pay-card-shell">
              <article className="saas-pay-card">
                <h3 className="saas-pay-plan-name">PRO</h3>
                <p className="saas-pay-plan-desc">Pour les commerces qui veulent une fidélité digitale performante sans complexité.</p>
                <div className="saas-pay-spotlight">
                  <div className="saas-pay-spotlight-top">
                    <Sparkles size={18} strokeWidth={2} className="saas-pay-sparkle" />
                    <div>
                      <p className="saas-pay-spotlight-title">Carte fidélité 100&nbsp;% digitale</p>
                      <p className="saas-pay-spotlight-sub">Apple Wallet et Google Wallet, sans application à installer.</p>
                    </div>
                  </div>
                </div>
                <div className="saas-pay-pricing">
                  <div className="saas-pay-price-row">
                    <span className="saas-pay-price">{priceLine.main}</span>
                    <span className="saas-pay-price-detail">{priceLine.detail}</span>
                  </div>
                  <p className="saas-pay-offer-line">Premier mois à 1&nbsp;€ seulement&nbsp;!</p>
                </div>
                <a className="saas-pay-cta" href={`/plan-pro/checkout?plan=${annual ? "annual" : "monthly"}`}>
                  Payer et continuer
                </a>
              </article>
            </div>
            <h2 className="saas-pay-compare-heading">Ce que couvre Pro</h2>
            <p className="saas-pay-compare-sub">Une seule offre, les modules essentiels inclus.</p>
            <p className="saas-pay-compare-pro-label">Pro</p>
            <div aria-label="Fonctionnalités incluses">
              {compareRows.map((row) => {
                const Icon = row.Icon;
                return (
                  <div key={row.name} className="saas-pay-model-card">
                    <div className="saas-pay-model-head">
                      <span className="saas-pay-model-name">{row.name}</span>
                      <span className="saas-pay-model-cost">{row.tag}</span>
                    </div>
                    <div className="saas-pay-model-body">
                      <div className="saas-pay-model-pro-value">
                        <Icon size={22} strokeWidth={1.75} />
                        {row.value}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <button type="button" className="saas-pay-see-more" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
              Voir plus
              <ChevronDown size={18} style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)" }} />
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="saas-pay saas-pay-checkout">
      <main className="saas-pay-checkout-main">
        <header className="saas-pay-checkout-head">
          <a className="saas-pay-checkout-back" href="/app" id="saas-pro-payment-back">
            <ArrowLeft size={16} strokeWidth={2.4} />
            Retour
          </a>
          <h1>Finalisez votre paiement</h1>
        </header>

        <section className="saas-pay-timeline">
          {billingTimeline.map((step, idx) => (
            <div key={`${step.title}-${idx}`} className="saas-pay-timeline-row">
              <div
                className={`saas-pay-timeline-marker${idx === 0 ? " is-active" : idx === 1 ? " is-focus" : ""}`}
                aria-hidden="true"
              >
                <span className="saas-pay-timeline-dot">
                  {step.icon === "check" ? <Check size={14} strokeWidth={2.5} /> : null}
                  {step.icon === "lock" ? <LockKeyhole size={14} strokeWidth={2.3} /> : null}
                  {step.icon === "bell" ? <Bell size={14} strokeWidth={2.2} /> : null}
                  {step.icon === "star" ? <Star size={14} strokeWidth={2.2} /> : null}
                </span>
                {idx < billingTimeline.length - 1 ? <i className="saas-pay-timeline-stem" /> : null}
              </div>
              <div className="saas-pay-timeline-copy">
                <p>{step.title}</p>
                <small>{step.subtitle}</small>
              </div>
              <strong>{step.amount}</strong>
            </div>
          ))}
        </section>

        <section className="saas-pay-total">
          <div className="saas-pay-summary-row">
            <span>Total à payer aujourd'hui</span>
            <strong className="saas-pay-total-amount">
              {!annual ? <span className="saas-pay-total-old-price">49,99€</span> : null}
              <span>{totals.totalToday}</span>
            </strong>
          </div>
          <div className="saas-pay-save-line">
            <Flame size={14} />
            <span>
              {annual
                ? "Plan annuel : meilleur prix sur 12 mois"
                : "Offre lancement : -98% sur le premier mois"}
            </span>
          </div>
        </section>

        <button
          type="button"
          className="saas-pay-link-btn"
          onClick={handlePay}
          disabled={busy || initializing || !elementsReady}
        >
          {busy ? "Traitement..." : initializing ? "Chargement..." : "Payer avec Link"}
        </button>

        <section className="saas-pay-method">
          <h2>Méthode de paiement</h2>

          <label>Numéro de carte</label>
          <div className="saas-pay-field saas-pay-card-number-field">
            <div className="saas-pay-card-number-input" ref={numberMountRef} />
            {cardUi.numberEmpty && !cardUi.numberFocus ? (
              <span className="saas-pay-field-placeholder">1234 1234 1234 1234</span>
            ) : null}
            <div className="saas-pay-card-brands" aria-hidden="true">
              <img
                className="saas-pay-card-brand-logo"
                src="https://cdn.worldvectorlogo.com/logos/mastercard-4.svg"
                alt="Mastercard"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <img
                className="saas-pay-card-brand-logo"
                src="https://cdn.worldvectorlogo.com/logos/visa-10.svg"
                alt="Visa"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <img
                className="saas-pay-card-brand-logo"
                src="https://cdn.worldvectorlogo.com/logos/google-pay-1.svg"
                alt="Google Pay"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <img
                className="saas-pay-card-brand-logo"
                src="https://cdn.worldvectorlogo.com/logos/apple-pay-2.svg"
                alt="Apple Pay"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
          </div>

          <div className="saas-pay-inline">
            <div>
              <label>Date d'expiration</label>
              <div className="saas-pay-field saas-pay-expiry-field">
                <div ref={expiryMountRef} />
                {cardUi.expiryEmpty && !cardUi.expiryFocus ? (
                  <span className="saas-pay-field-placeholder">MM / AA</span>
                ) : null}
              </div>
            </div>
            <div>
              <label>Code de sécurité</label>
              <div className="saas-pay-field saas-pay-cvc-field">
                <div ref={cvcMountRef} />
                {cardUi.cvcEmpty && !cardUi.cvcFocus ? (
                  <span className="saas-pay-field-placeholder">CVC</span>
                ) : null}
                <span className="saas-pay-cvc-icon" aria-hidden="true">
                  123
                </span>
              </div>
            </div>
          </div>

          <label>Pays</label>
          <div className="saas-pay-select-wrap">
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
              {COUNTRIES.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>

          <label className="saas-pay-check">
            <input type="checkbox" checked={saveCard} onChange={(e) => setSaveCard(e.target.checked)} />
            <span>Enregistrer les informations de paiement pour vos futurs achats</span>
          </label>

          {error ? <p className="saas-pay-feedback is-error">{error}</p> : null}
          {success ? <p className="saas-pay-feedback is-success">{success}</p> : null}

          <button
            type="button"
            className="saas-pay-continue"
            onClick={handlePay}
            disabled={busy || initializing || !elementsReady}
          >
            <LockKeyhole size={18} />
            {busy
              ? "Paiement en cours..."
              : initializing
                ? "Chargement du module..."
                : annual
                  ? "Payer 399,99€"
                  : "Payer 1€"}
          </button>
        </section>
      </main>
    </div>
  );
}
