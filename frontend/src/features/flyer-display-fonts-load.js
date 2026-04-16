import { FLYER_DISPLAY_FONTS_STYLESHEET_HREF } from "./flyer-display-fonts-url.js";

const LINK_ID = "fidpass-flyer-display-fonts";

export function ensureFlyerDisplayFontsLoaded() {
  if (typeof document === "undefined") return;
  if (document.getElementById(LINK_ID)) return;
  const link = document.createElement("link");
  link.id = LINK_ID;
  link.rel = "stylesheet";
  link.href = FLYER_DISPLAY_FONTS_STYLESHEET_HREF;
  document.head.appendChild(link);
}
