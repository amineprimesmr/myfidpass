/** CodePen fooontic/KwpRaGr — logique init (appelée après injection du HTML). */
export function runFooonticKwpRaGrSwitcherPen() {
  const switcher = document.querySelector(".switcher");
  if (!switcher) return;

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
        }
      });
    });
  };

  trackPrevious(switcher);
}