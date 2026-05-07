import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  Check,
  ChevronDown,
  Flame,
  LockKeyhole,
  Megaphone,
  Sparkles,
  Wallet,
} from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { API_BASE, STRIPE_PUBLISHABLE_KEY, FIDPASS_AUTH_RESTORED_EVENT, getAuthToken } from "../config.js";

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
  const isAppEmbed = (() => {
    if (typeof window === "undefined") return false;
    const v = String(new URLSearchParams(window.location.search).get("app_embed") || "").toLowerCase();
    return v === "1" || v === "true" || v === "yes";
  })();
  const isPaymentRoute =
    typeof window !== "undefined" &&
    /^\/(?:paiement|offre-pro|abonnement-pro|plan-pro)(?:\/checkout)?\/?$/i.test(window.location.pathname);
  const initialPlanAnnual = (() => {
    if (typeof window === "undefined") return false;
    const planParam = new URLSearchParams(window.location.search).get("plan");
    return String(planParam || "").toLowerCase() === "annual";
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
  const [authHandoffTick, setAuthHandoffTick] = useState(0);
  /** Jours d’essai Stripe renvoyés par l’API (`null` = pas encore chargé). */
  const [stripeTrialDays, setStripeTrialDays] = useState(null);

  useEffect(() => {
    const bump = () => setAuthHandoffTick((n) => n + 1);
    window.addEventListener(FIDPASS_AUTH_RESTORED_EVENT, bump);
    return () => window.removeEventListener(FIDPASS_AUTH_RESTORED_EVENT, bump);
  }, []);

  useEffect(() => {
    wireLiquidGlassTrackPrevious(liquidGlassSwitcherRef.current);
  }, [isPaymentRoute]);

  useEffect(() => {
    if (!isPaymentRoute) return;
    let cancelled = false;
    const setupEmbeddedCheckout = async () => {
      setInitializing(true);
      setError("");
      setSuccess("");
      setElementsReady(false);
      setSessionReady(false);
      setStripeTrialDays(null);
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
        if (typeof data.trial_days === "number" && !Number.isNaN(data.trial_days)) {
          setStripeTrialDays(data.trial_days);
        }

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
          placeholder: "",
        });
        const expiry = elements.create("cardExpiry", {
          style: baseStyle,
          placeholder: "",
        });
        const cvc = elements.create("cardCvc", {
          style: baseStyle,
          placeholder: "",
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
        number.mount(numberMountRef.current);
        expiry.mount(expiryMountRef.current);
        cvc.mount(cvcMountRef.current);
        numberElementRef.current = number;
        expiryElementRef.current = expiry;
        cvcElementRef.current = cvc;
        setSessionReady(true);
      } catch (err) {
        if (!cancelled) {
          setStripeTrialDays(null);
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
  }, [isPaymentRoute, annual, authHandoffTick]);

  useEffect(() => {
    setElementsReady(Boolean(cardState.number && cardState.expiry && cardState.cvc));
  }, [cardState]);

  const totals = useMemo(() => {
    if (!annual) {
      return {
        planLabel: "Pro mensuel",
        planAmount: "49,99€",
        promoLabel: "Promo lancement (1er mois)",
        promoAmount: "-48,99€ (-98%)",
        totalToday: "1€",
      };
    }
    if (stripeTrialDays === 0) {
      return {
        planLabel: "Pro annuel",
        planAmount: "399€",
        promoLabel: "Promo lancement",
        promoAmount: "-398€",
        totalToday: "1€",
      };
    }
    return {
      planLabel: "Pro annuel",
      planAmount: "399€",
      promoLabel: "Période d’essai",
      promoAmount: "Sans prélèvement",
      totalToday: "0€",
    };
  }, [annual, stripeTrialDays]);
  const billingTimeline = useMemo(() => {
    const now = new Date();
    const renewAnchor = new Date(now);
    if (annual) renewAnchor.setFullYear(renewAnchor.getFullYear() + 1);
    else renewAnchor.setMonth(renewAnchor.getMonth() + 1);
    const renewSubtitle = annual
      ? "Soit 399\u00a0€ facturés annuellement,\u00a0sans\u00a0engagement."
      : "Sans engagement, annulable à tout moment\u202f!";
    const renewAmount = annual ? "34 € /mois" : "49,99 € /mois";

    if (!annual) {
      return [
        { title: "Aujourd’hui", subtitle: "Offre premier mois", amount: "Payez 1€", icon: "lock" },
        {
          title: formatDateFr(renewAnchor),
          subtitle: renewSubtitle,
          amount: renewAmount,
          icon: "check",
        },
      ];
    }
    if (stripeTrialDays === 0) {
      return [
        { title: "Aujourd’hui", subtitle: "Offre premier mois", amount: "Payez 1€", icon: "lock" },
        {
          title: formatDateFr(renewAnchor),
          subtitle: renewSubtitle,
          amount: renewAmount,
          icon: "check",
        },
      ];
    }
    return [
      {
        title: "Aujourd’hui",
        subtitle: "Essai gratuit — enregistrement de carte, aucun prélèvement",
        amount: "0€",
        icon: "lock",
      },
      {
        title: formatDateFr(renewAnchor),
        subtitle: renewSubtitle,
        amount: renewAmount,
        icon: "check",
      },
    ];
  }, [annual, stripeTrialDays]);

  const priceLine = annual
    ? { main: "399€", detail: "facturé annuellement" }
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

  return (
    <div className="saas-pay saas-pay-checkout">
      <main className="saas-pay-checkout-main">
        <header className="saas-pay-checkout-head">
          {!isAppEmbed ? (
            <a className="saas-pay-checkout-back" href="/app" id="saas-pro-payment-back">
              <ArrowLeft size={16} strokeWidth={2.4} />
              Retour
            </a>
          ) : null}
          <h1>DÉBLOQUEZ TOUT</h1>
          <p className="saas-pay-checkout-trust-lead">
            {annual ? (
              stripeTrialDays === 0 ? (
                <>
                  Commencez pour <strong>1&nbsp;€</strong>, puis <strong>399&nbsp;€&nbsp;/&nbsp;an</strong>
                </>
              ) : (
                <>
                  Essai gratuit, puis <strong>399&nbsp;€&nbsp;/&nbsp;an</strong>
                </>
              )
            ) : (
              <>Commencez à fidéliser dès aujourd&apos;hui pour 1&nbsp;€</>
            )}
          </p>
          <div className="saas-pay-checkout-trust-badge" role="status">
            <div className="saas-pay-checkout-trust-badge__stack" aria-hidden="true">
              {AVA.map((src, idx) => (
                <img
                  key={src}
                  src={src}
                  alt=""
                  width={32}
                  height={32}
                  loading="lazy"
                  decoding="async"
                  className="saas-pay-checkout-trust-badge__avatar"
                  style={{ zIndex: AVA.length - idx }}
                />
              ))}
            </div>
            <p className="saas-pay-checkout-trust-badge__label">
              Adopté par +125 commerces
            </p>
          </div>
        </header>

        <div className="saas-pay-billing saas-pay-billing--checkout">
          <div className="saas-pay-billing-liquid">
            <fieldset
              ref={liquidGlassSwitcherRef}
              className="switcher"
              role="radiogroup"
              aria-label="Facturation mensuelle ou annuelle"
            >
              <legend className="switcher__legend">Facturation mensuelle ou annuelle</legend>
              <label className="switcher__option" title="Mensuel">
                <input
                  className="switcher__input"
                  type="radio"
                  name="saasBillingPeriodCheckout"
                  value="monthly"
                  checked={!annual}
                  onChange={() => setAnnual(false)}
                  aria-label="Mensuel"
                  {...{ "c-option": "1" }}
                />
                <span className="switcher__text">Mensuel</span>
              </label>
              <label className="switcher__option" title="Annuel">
                <input
                  className="switcher__input"
                  type="radio"
                  name="saasBillingPeriodCheckout"
                  value="annual"
                  checked={annual}
                  onChange={() => setAnnual(true)}
                  aria-label="Annuel"
                  {...{ "c-option": "2" }}
                />
                <span className="switcher__text">Annuel</span>
              </label>
              <svg className="switcher__filter" aria-hidden="true">
                <defs>
                  <filter id="saasBillingLiquidGoo">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
                    <feColorMatrix
                      in="blur"
                      mode="matrix"
                      values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10"
                      result="goo"
                    />
                    <feComposite in="SourceGraphic" in2="goo" operator="atop" />
                  </filter>
                </defs>
              </svg>
            </fieldset>
          </div>
        </div>

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
            <span>Total à payer</span>
            <strong className="saas-pay-total-amount">
              <span className="saas-pay-total-old-price">{annual ? "399€" : "49,99€"}</span>
              <span>{totals.totalToday}</span>
            </strong>
          </div>
        </section>

        <section className="saas-pay-method">
          <label>Numéro de carte</label>
          <div className="saas-pay-field saas-pay-card-number-field">
            <div className="saas-pay-card-number-input" ref={numberMountRef} />
            {cardUi.numberEmpty ? <span className="saas-pay-field-placeholder">1234 1234 1234 1234</span> : null}
            <div className="saas-pay-card-brands" aria-hidden="true">
              <img
                className="saas-pay-card-brand-logo saas-pay-card-brand-logo--sheet"
                src="/assets/badges.png?v=2"
                alt=""
                loading="lazy"
              />
            </div>
          </div>

          <div className="saas-pay-inline">
            <div>
              <label>Date d'expiration</label>
              <div className="saas-pay-field saas-pay-expiry-field">
                <div ref={expiryMountRef} />
                {cardUi.expiryEmpty ? <span className="saas-pay-field-placeholder">MM / AA</span> : null}
              </div>
            </div>
            <div>
              <label>Code de sécurité</label>
              <div className="saas-pay-field saas-pay-cvc-field">
                <div ref={cvcMountRef} />
                {cardUi.cvcEmpty ? <span className="saas-pay-field-placeholder">CVC</span> : null}
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
                : !annual || stripeTrialDays === 0
                  ? "Payer 1€"
                  : "Continuer"}
          </button>
        </section>
      </main>
    </div>
  );
}
