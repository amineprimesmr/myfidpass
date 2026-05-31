import { createRoot } from "react-dom/client";
import { LandingCinematicApp } from "./LandingCinematicApp.jsx";
import { FinTapDemoRequestSection } from "./FinTapDemoRequestSection.jsx";

function installDevConsoleFilter() {
  if (!import.meta.env.DEV) return;
  const orig = console.error;
  console.error = (...args) => {
    const first = String(args[0] ?? "");
    if (first.includes("Each child in a list should have a unique") || first.includes("key prop")) {
      return;
    }
    orig.apply(console, args);
  };
}

/**
 * Monte la LP cinéma sur #landing-cinematic-root.
 */
export function mountLandingCinematic() {
  const el = document.getElementById("landing-cinematic-root");
  if (!el) return;
  installDevConsoleFilter();
  const existingRoot = el.__landingCinematicRoot;
  const root = existingRoot || createRoot(el);
  if (!existingRoot) el.__landingCinematicRoot = root;
  root.render(<LandingCinematicApp />);
  mountLandingDemoRequest();
  // Notify hero scroll component that landing is now visible so it can snap to correct position.
  // Two rAF frames give the browser time to finish scroll restoration before resyncing.
  if (existingRoot) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent("fidpass:landing-visible"));
      });
    });
  }
}

/** Monte la section démo sous la FAQ (#landing-demo-root). */
export function mountLandingDemoRequest() {
  const el = document.getElementById("landing-demo-root");
  if (!el) return;
  const existingRoot = el.__landingDemoRoot;
  const root = existingRoot || createRoot(el);
  if (!existingRoot) el.__landingDemoRoot = root;
  root.render(<FinTapDemoRequestSection />);
}
