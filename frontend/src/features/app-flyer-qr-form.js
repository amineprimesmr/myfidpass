/**
 * Lecture / écriture formulaire Flyer QR + persistance localStorage (état métier).
 */
import { FLYER_STORAGE_KEY, mergeFlyerState } from "./app-flyer-qr-presets.js";

/** @param {ParentNode} root */
export function readFlyerStateFromForm(root) {
  /** @type {Record<string, HTMLInputElement | HTMLTextAreaElement | null>} */
  const q = (id) => root.querySelector(`#${id}`);
  return mergeFlyerState({
    headline: q("app-flyer-headline")?.value,
    ctaBanner: q("app-flyer-cta")?.value,
    step1: q("app-flyer-step1")?.value,
    step2: q("app-flyer-step2")?.value,
    step3: q("app-flyer-step3")?.value,
    social1: q("app-flyer-social-1-type")?.value ?? "",
    socialUrl1: q("app-flyer-social-1-url")?.value ?? "",
    social2: q("app-flyer-social-2-type")?.value ?? "",
    socialUrl2: q("app-flyer-social-2-url")?.value ?? "",
    social3: q("app-flyer-social-3-type")?.value ?? "",
    socialUrl3: q("app-flyer-social-3-url")?.value ?? "",
    colorPrimary: q("app-flyer-c1")?.value,
    colorSecondary: q("app-flyer-c2")?.value,
    colorAccent: q("app-flyer-c3")?.value,
    colorBgTop: q("app-flyer-bg1")?.value,
    colorBgBottom: q("app-flyer-bg2")?.value,
    wheelRenderMode: q("app-flyer-wheel-mode")?.value === "png" ? "png" : "segments",
    wheelColorOdd: q("app-flyer-wheel-color-odd")?.value,
    wheelColorEven: q("app-flyer-wheel-color-even")?.value,
    wheelSegmentOffsetDeg: Number(q("app-flyer-wheel-offset")?.value),
    headlineFontId: q("app-flyer-headline-font")?.value,
    headlineTextColor: q("app-flyer-headline-fill")?.value,
    headlineStrokeColor: q("app-flyer-headline-stroke")?.value,
    headlineStrokeWidth: Number(q("app-flyer-headline-stroke-w")?.value),
    headlineLogoGapPct: Number(q("app-flyer-headline-logo-gap")?.value),
    headlineLetterSpacing: Number(q("app-flyer-headline-tracking")?.value),
    headlineSizePct: Number(q("app-flyer-headline-size")?.value),
    flyerFooterTextScalePct: Number(q("app-flyer-footer-text-scale")?.value),
    flyerWheelLabelScalePct: Number(q("app-flyer-wheel-label-scale")?.value),
    flyerBgOverlayPct: Number(q("app-flyer-bg-overlay")?.value),
    flyerQrOutlineWidth: Number(q("app-flyer-qr-outline")?.value),
  });
}

/** @param {ParentNode} root @param {import("./app-flyer-qr-presets.js").FlyerState} s */
export function writeFlyerFormFromState(root, s) {
  const set = (id, v) => {
    const el = root.querySelector(`#${id}`);
    if (el && "value" in el) el.value = v;
  };
  set("app-flyer-headline", s.headline);
  set("app-flyer-cta", s.ctaBanner);
  set("app-flyer-step1", s.step1);
  set("app-flyer-step2", s.step2);
  set("app-flyer-step3", s.step3);
  set("app-flyer-social-1-type", s.social1 ?? "");
  set("app-flyer-social-1-url", s.socialUrl1 ?? "");
  set("app-flyer-social-2-type", s.social2 ?? "");
  set("app-flyer-social-2-url", s.socialUrl2 ?? "");
  set("app-flyer-social-3-type", s.social3 ?? "");
  set("app-flyer-social-3-url", s.socialUrl3 ?? "");
  set("app-flyer-c1", s.colorPrimary);
  set("app-flyer-c2", s.colorSecondary);
  set("app-flyer-c3", s.colorAccent);
  set("app-flyer-bg1", s.colorBgTop);
  set("app-flyer-bg2", s.colorBgBottom);
  set("app-flyer-wheel-mode", s.wheelRenderMode === "png" ? "png" : "segments");
  set("app-flyer-wheel-color-odd", s.wheelColorOdd ?? "");
  set("app-flyer-wheel-color-even", s.wheelColorEven ?? "");
  set("app-flyer-wheel-offset", String(s.wheelSegmentOffsetDeg ?? 0));
  set("app-flyer-headline-font", s.headlineFontId ?? "");
  set("app-flyer-headline-fill", s.headlineTextColor);
  set("app-flyer-headline-stroke", s.headlineStrokeColor);
  set("app-flyer-headline-stroke-w", String(s.headlineStrokeWidth ?? 0));
  set("app-flyer-headline-logo-gap", String(s.headlineLogoGapPct ?? 0));
  set("app-flyer-headline-tracking", String(s.headlineLetterSpacing ?? 0));
  set("app-flyer-headline-size", String(s.headlineSizePct ?? 9.2));
  set("app-flyer-footer-text-scale", String(s.flyerFooterTextScalePct ?? 100));
  set("app-flyer-wheel-label-scale", String(s.flyerWheelLabelScalePct ?? 100));
  set("app-flyer-bg-overlay", String(s.flyerBgOverlayPct ?? 52));
  set("app-flyer-qr-outline", String(s.flyerQrOutlineWidth ?? 0));
}

export function loadStoredFlyerState() {
  try {
    const raw = localStorage.getItem(FLYER_STORAGE_KEY);
    if (!raw) return mergeFlyerState(null);
    return mergeFlyerState(JSON.parse(raw));
  } catch (_) {
    return mergeFlyerState(null);
  }
}

/** @param {import("./app-flyer-qr-presets.js").FlyerState} s */
export function persistFlyerState(s) {
  try {
    localStorage.setItem(FLYER_STORAGE_KEY, JSON.stringify(s));
  } catch (_) {}
}
