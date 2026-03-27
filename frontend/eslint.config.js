/**
 * Configuration ESLint du frontend.
 * Flat config (ESLint 9+).
 */

import js from "@eslint/js";

// Globaux navigateur communs dans le frontend
const browserGlobals = {
  window: "readonly",
  document: "readonly",
  navigator: "readonly",
  localStorage: "readonly",
  sessionStorage: "readonly",
  location: "readonly",
  history: "readonly",
  fetch: "readonly",
  console: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  requestAnimationFrame: "readonly",
  cancelAnimationFrame: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  CustomEvent: "readonly",
  Event: "readonly",
  AbortController: "readonly",
  FormData: "readonly",
  Blob: "readonly",
  Image: "readonly",
  HTMLElement: "readonly",
  IntersectionObserver: "readonly",
  crypto: "readonly",
  screen: "readonly",
  // Vite
  import: "readonly",
};

export default [
  js.configs.recommended,
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["src/**/*.js", "src/**/*.jsx"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: browserGlobals,
    },
    rules: {
      // Warn sur les vars non utilisées (pas error — trop de faux positifs en vanilla JS)
      "no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      // Les console.log sont acceptés mais on les limite en prod via bundler
      "no-console": "off",
      // Catch vides autorisés (pattern courant dans ce projet)
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Préférer const quand la variable n'est pas réassignée
      "prefer-const": "warn",
      // Pas d'assignation dans des conditions (= au lieu de ==)
      "no-cond-assign": "error",
      // Pas de variables globales implicites
      "no-undef": "error",
    },
  },
];
