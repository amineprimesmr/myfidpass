const WHATSAPP_URL = "https://wa.me/33782637720";

/** @param {HTMLElement} switcher */
function revertSwitcherToPrevious(switcher) {
  const prev = switcher.getAttribute("c-previous") || "1";
  const radio = switcher.querySelector(`input[c-option="${prev}"]`);
  if (radio instanceof HTMLInputElement) radio.checked = true;
}

/** @param {HTMLElement} switcher */
function openWhatsApp(switcher) {
  window.open(WHATSAPP_URL, "_blank", "noopener,noreferrer");
  revertSwitcherToPrevious(switcher);
}

/** CodePen fooontic/KwpRaGr — logique init (appelée après injection du HTML). */
export function runFooonticKwpRaGrSwitcherPen() {
  const switcher = document.querySelector(".switcher");
  if (!switcher) return;

  const SCROLL_ACTIONS = {
    "1": () => window.scrollTo({ top: 0, behavior: "smooth" }),
    "2": () => {
      window.location.assign("/get");
    },
    "3": () => openWhatsApp(switcher),
  };

  const trackPrevious = (el) => {
    const radios = el.querySelectorAll('input[type="radio"]');
    let previousValue = null;

    const initiallyChecked = el.querySelector('input[type="radio"]:checked');
    if (initiallyChecked) {
      previousValue = initiallyChecked.getAttribute("c-option");
      el.setAttribute("c-previous", previousValue);
    }

    radios.forEach((radio) => {
      radio.addEventListener("change", () => {
        if (radio.checked) {
          el.setAttribute("c-previous", previousValue ?? "");
          previousValue = radio.getAttribute("c-option");

          const option = radio.getAttribute("c-option");
          const action = SCROLL_ACTIONS[option];
          if (action) action();
        }
      });
    });
  };

  trackPrevious(switcher);

  switcher.querySelectorAll(".switcher__option--download, .switcher__option--whatsapp").forEach((option) => {
    option.addEventListener("click", () => {
      const radio = option.querySelector('input[type="radio"]');
      if (radio?.checked) {
        const optionId = radio.getAttribute("c-option");
        const action = optionId ? SCROLL_ACTIONS[optionId] : null;
        if (action) action();
      }
    });
  });
}
