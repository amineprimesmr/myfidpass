/* eslint-env node */
"use strict";

const { createRequire } = require("module");
const js = require("@eslint/js");
const requireFront = createRequire(require.resolve("./frontend/package.json"));
const tsParser = requireFront("@typescript-eslint/parser");
const tsPlugin = requireFront("@typescript-eslint/eslint-plugin");

const browserGlobals = {
  process: "readonly",
  console: "readonly",
  Buffer: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  module: "readonly",
  require: "readonly",
  exports: "writable",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setImmediate: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  fetch: "readonly",
  window: "readonly",
  document: "readonly",
  navigator: "readonly",
  screen: "readonly",
  requestAnimationFrame: "readonly",
  sessionStorage: "readonly",
  localStorage: "readonly",
  history: "readonly",
  location: "readonly",
  global: "readonly",
  URLSearchParams: "readonly",
  CustomEvent: "readonly",
  Image: "readonly",
  HTMLElement: "readonly",
  NodeList: "readonly",
  Element: "readonly",
  Event: "readonly",
  MouseEvent: "readonly",
  KeyboardEvent: "readonly",
  AbortController: "readonly",
  FormData: "readonly",
  Blob: "readonly",
  URL: "readonly",
  crypto: "readonly",
  IntersectionObserver: "readonly",
};

module.exports = [
  js.configs.recommended,
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.git/**",
      "**/frontend/dist/**",
      "**/backend/data/**",
    ],
  },
  {
    files: [
      "backend/**/*.js",
      "frontend/src/**/*.js",
      "frontend/src/**/*.jsx",
      "scripts/**/*.js",
      "scripts/**/*.mjs",
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: browserGlobals,
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "prefer-const": "warn",
    },
  },
  {
    files: ["frontend/src/landing-ai-agency/**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: browserGlobals,
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "prefer-const": "warn",
    },
  },
];
