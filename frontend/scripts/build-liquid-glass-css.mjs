import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync("/tmp/fooontic-full.html", "utf8");
const s = html.indexOf("<style>");
const e = html.indexOf("</style>", s);
let css = html.slice(s + 7, e);

const articleStart = css.indexOf("/* //////////////////////////////////////////");
if (articleStart !== -1) css = css.slice(0, articleStart).trimEnd();

css = css.replace(
  "backdrop-filter: blur(8px) url(#switcher) saturate(var(--saturation));",
  "backdrop-filter: blur(8px) url(#saasPayLgSwitcher) saturate(var(--saturation));",
);

const oldBody = `body {
  --c-glass: #bbbbbc;
  --c-light: #fff;
  --c-dark: #000;
  
  --c-content: #224;
  --c-action: #0052f5;
  
  --c-bg: #E8E8E9;
  
  --glass-reflex-dark: 1;
  --glass-reflex-light: 1;
  
  --saturation: 150%;
  
  font-size: 20px;
  font-family: "DM Sans", sans-serif;
  font-optical-sizing: auto;
  background: var(--c-bg);
  color: var(--c-content);
  
  transition: background 400ms cubic-bezier(1, 0.0, 0.4, 1), color 400ms cubic-bezier(1, 0.0, 0.4, 1);
}

body:has(input[value="dark"]:checked) {
  --c-glass: #bbbbbc;
  --c-light: #fff;
  --c-dark: #000;
  
  --c-content: #e1e1e1;
  --c-action: #03d5ff;
  
  --c-bg: #1b1b1d;
  
  --glass-reflex-dark: 2;
  --glass-reflex-light: 0.3;
  
  --saturation: 150%;
}

body:has(input[value="dim"]:checked) {
  --c-light: #99deff;
  --c-dark: #20001b;
  --c-glass: hsl(335 250% 74% / 1);
  
  --c-content: #d5dbe2;
  --c-action: #ff48a9;
  
  --c-bg: #152433;
  
  --glass-reflex-dark: 2;
  --glass-reflex-light: 0.7;
  
  --saturation: 200%;
}


`;

const newScope = `/* Theme vars on switcher (dark preset, paiement page) */
.saas-pay .saas-pay-billing-liquid fieldset.switcher {
  --c-glass: #bbbbbc;
  --c-light: #fff;
  --c-dark: #000;
  --c-content: #e1e1e1;
  --c-action: #03d5ff;
  --glass-reflex-dark: 2;
  --glass-reflex-light: 0.3;
  --saturation: 150%;
  font-size: 20px;
  font-family: "DM Sans", sans-serif;
  font-optical-sizing: auto;
}


`;

if (!css.includes(oldBody)) throw new Error("body block not found");
css = css.replace(oldBody, newScope);

const P = ".saas-pay .saas-pay-billing-liquid ";
css = css.replace(/^\.switcher \{/m, `${P}fieldset.switcher {`);
css = css.replace(/^\.switcher__/gm, `${P}.switcher__`);
css = css.replace(/^\.switcher:/gm, `${P}fieldset.switcher:`);
css = css.replace(/^\.switcher\[/gm, `${P}fieldset.switcher[`);

css = css.replace(
  /\.saas-pay \.saas-pay-billing-liquid fieldset\.switcher:has\(input\[c-option="3"\]:checked\)::after \{[^}]*\}\s*/s,
  "",
);

css = css.replace(/@-webkit-keyframes scaleToggle3 \{[^}]*\}\s*/g, "");
css = css.replace(/@keyframes scaleToggle3 \{[^}]*\}\s*/g, "");

css = css.replace(
  /\.saas-pay \.saas-pay-billing-liquid fieldset\.switcher\[c-previous="3"\]:has\(input\[c-option="2"\]:checked\)::after \{[^}]*\}\s*/s,
  "",
);

css = css.replace(/width: 244px;/, "width: 168px;");
css = css.replace(/max-width: 244px;/, "max-width: 168px;");

css = css.replace(
  `  position: fixed;
  z-index: 1;
  top: 40px;
  left: 50%;
  translate: -50%;`,
  `  position: relative;
  z-index: 1;
  top: auto;
  left: auto;
  translate: none;`,
);

const header = `/* Liquid Glass switcher — CodePen fooontic/KwpRaGr (FreeFrontend css-liquid-glass). Filter url(#saasPayLgSwitcher). */
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,100..1000&display=swap');


`;

const out = join(__dirname, "../src/saas-liquid-glass-billing.css");
writeFileSync(out, header + css.trimStart());
console.log("wrote", out);
