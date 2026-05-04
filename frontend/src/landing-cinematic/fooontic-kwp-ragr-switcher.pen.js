/** CodePen fooontic/KwpRaGr — logique init (appelée après injection du HTML). */
export function runFooonticKwpRaGrSwitcherPen() {
  const switcher = document.querySelector(".switcher");
  if (!switcher) return;

  const SCROLL_TARGETS = {
    "1": null,              // home → top of page
    "2": "#comment-ca-marche",
    "3": "#testimonials",
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
          const targetSelector = SCROLL_TARGETS[option];

          if (targetSelector) {
            const target = document.querySelector(targetSelector);
            if (target) {
              target.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          } else {
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        }
      });
    });
  };

  trackPrevious(switcher);
}
