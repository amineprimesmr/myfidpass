import { createRoot } from "react-dom/client";
import { LandingCinematicApp } from "./LandingCinematicApp.jsx";

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
  const root = createRoot(el);
  root.render(<LandingCinematicApp />);
}
