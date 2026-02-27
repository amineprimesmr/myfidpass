#!/usr/bin/env node
/**
 * Exemple d'intégration Fidpass — Scan + crédit de points
 *
 * Usage : node fidpass-scan-example.js <BASE_URL> <SLUG> <TOKEN> <BARCODE> [MONTANT_EUR]
 *
 * Exemple :
 *   node fidpass-scan-example.js https://api.myfidpass.fr cafe-dupont VOTRE_TOKEN uuid-du-membre 12.50
 *
 * Pour un simple passage (sans montant) :
 *   node fidpass-scan-example.js https://api.myfidpass.fr cafe-dupont VOTRE_TOKEN uuid-du-membre --visit
 */

const [baseUrl, slug, token, barcode, amountOrVisit] = process.argv.slice(2);

if (!baseUrl || !slug || !token || !barcode) {
  console.error("Usage: node fidpass-scan-example.js <BASE_URL> <SLUG> <TOKEN> <BARCODE> [MONTANT_EUR|--visit]");
  process.exit(1);
}

const visit = amountOrVisit === "--visit";
const amountEur = visit ? undefined : parseFloat(amountOrVisit || "0");

const body = { barcode };
if (visit) body.visit = true;
else if (amountEur > 0) body.amount_eur = amountEur;

const url = `${baseUrl.replace(/\/$/, "")}/api/businesses/${encodeURIComponent(slug)}/integration/scan`;

fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Dashboard-Token": token,
  },
  body: JSON.stringify(body),
})
  .then((res) => {
    if (!res.ok) return res.json().then((d) => { throw new Error(d.error || res.statusText); });
    return res.json();
  })
  .then((data) => {
    console.log("Succès :", data.points_added, "point(s) ajouté(s). Nouveau solde :", data.new_balance);
  })
  .catch((err) => {
    console.error("Erreur :", err.message);
    process.exit(1);
  });
