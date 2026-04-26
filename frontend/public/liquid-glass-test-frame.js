/**
 * Initialise liquidGL dans l’iframe de démonstration (dépendances : html2canvas, liquidGL.js).
 */
function waitForDeps(attempt) {
  const h2c = typeof window.html2canvas !== "undefined";
  const lg = typeof window.liquidGL === "function";
  if (h2c && lg) {
    return window.liquidGL({
      snapshot: "body",
      target: ".liquidGL",
      resolution: 1.5,
      refraction: 0,
      bevelDepth: 0.052,
      bevelWidth: 0.211,
      frost: 2,
      shadow: true,
      specular: true,
      reveal: "fade",
      tilt: true,
      tiltFactor: 5,
      magnify: 1,
    });
  }
  if ((attempt || 0) < 200) {
    setTimeout(function () {
      waitForDeps((attempt || 0) + 1);
    }, 20);
  } else {
    console.warn("liquidGL: html2canvas ou liquidGL manquant après le chargement.");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () {
    waitForDeps(0);
  });
} else {
  waitForDeps(0);
}
