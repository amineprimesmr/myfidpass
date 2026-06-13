/** Portail développeurs / intégrateurs MyFidpass (caisse, borne, partenaires). */

const API_BASE = "https://api.myfidpass.fr";
const SUPPORT = "support@myfidpass.fr";

function devNav(active) {
  const links = [
    { href: "/developers", id: "hub", label: "Accueil développeurs" },
    { href: "/developers/api", id: "api", label: "Documentation API" },
    { href: "/developers/partenaires/innovorder", id: "innovorder", label: "Partenaire Innovorder" },
    { href: "/integration-caisse-fidelite-wallet", id: "merchant", label: "Guide commerçant" },
  ];
  const items = links
    .map(
      (l) =>
        `<a href="${l.href}" class="dev-portal-nav-link${active === l.id ? " is-active" : ""}">${l.label}</a>`
    )
    .join("");
  return `<nav class="dev-portal-nav" aria-label="Documentation développeurs">${items}</nav>`;
}

function wrapDevPortal({ active, title, bodyHtml }) {
  return `
    <article class="dev-portal landing-seo-article">
      ${devNav(active)}
      <header class="dev-portal-header">
        <p class="dev-portal-kicker">MyFidpass · Développeurs &amp; partenaires</p>
        <h1>${title}</h1>
      </header>
      <div class="dev-portal-body">
        ${bodyHtml}
      </div>
      <footer class="dev-portal-footer">
        <p>Support intégrations : <a href="mailto:${SUPPORT}">${SUPPORT}</a> · API : <code>${API_BASE}</code></p>
      </footer>
    </article>
  `;
}

function codeBlock(content) {
  return `<pre class="dev-portal-code"><code>${content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>`;
}

export function renderDevelopersHubPage() {
  const body = `
    <p class="dev-portal-lead">
      Connectez une <strong>caisse</strong>, une <strong>borne de commande</strong> ou un logiciel métier
      à MyFidpass : le client présente sa carte <strong>Apple Wallet / Google Wallet</strong>,
      votre système scanne le QR et crédite les points via notre API REST.
    </p>
    <section class="dev-portal-cards">
      <a class="dev-portal-card" href="/developers/api">
        <h2>Documentation API</h2>
        <p>Endpoints, authentification, exemples cURL et JavaScript, codes d'erreur.</p>
      </a>
      <a class="dev-portal-card" href="/developers/partenaires/innovorder">
        <h2>Partenariat Innovorder</h2>
        <p>Spécification borne, pilote NBK Rennes, modèle d'email pour l'équipe Innovorder.</p>
      </a>
      <a class="dev-portal-card" href="/integration-caisse-fidelite-wallet">
        <h2>Guide commerçant</h2>
        <p>Ce que le restaurateur transmet à son intégrateur (slug + token).</p>
      </a>
    </section>
    <section class="landing-legal-section">
      <h2>Qui utilise ce portail ?</h2>
      <ul>
        <li><strong>Éditeurs de caisse / borne</strong> (Innovorder, Tabesto, Zelty…) — intégration native marketplace</li>
        <li><strong>Installateurs</strong> — branchement API pour un commerce client</li>
        <li><strong>Franchises</strong> — homogénéité multi-sites (ex. NBK + Innovorder)</li>
      </ul>
    </section>
    <section class="landing-legal-section">
      <h2>Fichiers techniques</h2>
      <ul>
        <li><a href="/openapi/myfidpass-integration.yaml">OpenAPI — intégration caisse/borne</a></li>
        <li>Base API production : <code>${API_BASE}</code></li>
      </ul>
    </section>
  `;
  return wrapDevPortal({
    active: "hub",
    title: "Portail développeurs MyFidpass",
    bodyHtml: body,
  });
}

export function renderDevelopersApiPage() {
  const curlLookup = `curl -s -G "${API_BASE}/api/businesses/VOTRE_SLUG/integration/lookup" \\
  --data-urlencode "barcode=UUID-MEMBRE" \\
  -H "X-Dashboard-Token: VOTRE_TOKEN"`;

  const curlScan = `curl -s -X POST "${API_BASE}/api/businesses/VOTRE_SLUG/integration/scan" \\
  -H "Content-Type: application/json" \\
  -H "X-Dashboard-Token: VOTRE_TOKEN" \\
  -d '{"barcode":"UUID-MEMBRE","amount_eur":12.50}'`;

  const jsExample = `const res = await fetch(
  \`${API_BASE}/api/businesses/\${slug}/integration/scan\`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Dashboard-Token": token,
    },
    body: JSON.stringify({ barcode: uuidFromQr, amount_eur: orderTotal }),
  }
);
const data = await res.json();
// data.points_added, data.new_balance`;

  const body = `
    <p class="dev-portal-lead">
      Une seule API pour toutes les marques de caisse et de borne. Pas de plugin par éditeur :
      si votre logiciel envoie des requêtes HTTP et lit un QR code, vous pouvez intégrer MyFidpass.
    </p>

    <section class="landing-legal-section">
      <h2>1. Authentification</h2>
      <p>Chaque commerce possède un <strong>token dashboard</strong> et un <strong>slug</strong> (identifiant URL).</p>
      <ul>
        <li>Header recommandé : <code>X-Dashboard-Token: VOTRE_TOKEN</code></li>
        <li>Alternative test : <code>?token=VOTRE_TOKEN</code> en query</li>
        <li>Ne jamais exposer le token côté client public (borne : appels serveur à serveur)</li>
      </ul>
    </section>

    <section class="landing-legal-section">
      <h2>2. QR code Wallet</h2>
      <p>Le QR sur la carte Apple Wallet / Google Wallet contient l'<strong>UUID du membre</strong> (ex. <code>a1b2c3d4-e5f6-7890-abcd-ef1234567890</code>).</p>
      <p>Envoyez cette valeur dans le champ <code>barcode</code> de l'API.</p>
    </section>

    <section class="landing-legal-section">
      <h2>3. GET — Consulter un membre (lookup)</h2>
      <p>Afficher nom + solde <strong>sans</strong> créditer de points (écran borne avant paiement).</p>
      <p><code>GET /api/businesses/{slug}/integration/lookup?barcode={uuid}</code></p>
      ${codeBlock(curlLookup)}
      <p>Réponse 200 : <code>member.id</code>, <code>member.name</code>, <code>member.points</code>, optionnel <code>reward_redeem</code>.</p>
    </section>

    <section class="landing-legal-section">
      <h2>4. POST — Scan + crédit (recommandé)</h2>
      <p>Un seul appel après validation du ticket : scan + points selon règle du commerce (€ ou passage).</p>
      <p><code>POST /api/businesses/{slug}/integration/scan</code></p>
      ${codeBlock(curlScan)}
      <p>Corps JSON : <code>barcode</code> (obligatoire) + un parmi <code>amount_eur</code>, <code>visit: true</code>, <code>points</code>.</p>
      <p>Réponse 200 : <code>points_added</code>, <code>new_balance</code>, objet <code>member</code>.</p>
    </section>

    <section class="landing-legal-section">
      <h2>5. POST — Utiliser une récompense</h2>
      <p>Quand le client présente le QR « Utiliser en magasin » sur sa carte :</p>
      <p><code>POST /api/businesses/{slug}/integration/reward-redeem</code> avec <code>barcode</code>.</p>
    </section>

    <section class="landing-legal-section">
      <h2>6. Exemple JavaScript</h2>
      ${codeBlock(jsExample)}
    </section>

    <section class="landing-legal-section">
      <h2>7. Codes d'erreur</h2>
      <table class="dev-portal-table">
        <thead><tr><th>HTTP</th><th>Code</th><th>Signification</th></tr></thead>
        <tbody>
          <tr><td>400</td><td>BARCODE_MISSING</td><td>QR non lu ou vide</td></tr>
          <tr><td>400</td><td>NO_POINTS_SPECIFIED</td><td>Manque amount_eur, visit ou points</td></tr>
          <tr><td>401</td><td>—</td><td>Token invalide</td></tr>
          <tr><td>404</td><td>MEMBER_NOT_FOUND</td><td>Carte d'un autre commerce ou invalide</td></tr>
        </tbody>
      </table>
    </section>

    <section class="landing-legal-section">
      <h2>8. Flux borne (résumé)</h2>
      <ol>
        <li>Client choisit « Fidélité » sur la borne</li>
        <li>Scan QR Wallet → <code>GET lookup</code> → afficher « Bonjour Marie, 42 pts »</li>
        <li>Client commande et paie</li>
        <li>Borne envoie <code>POST scan</code> avec montant ticket</li>
        <li>Wallet client mis à jour (PassKit / Google Wallet)</li>
      </ol>
    </section>

    <section class="landing-legal-section">
      <h2>OpenAPI</h2>
      <p><a href="/openapi/myfidpass-integration.yaml">Télécharger myfidpass-integration.yaml</a></p>
    </section>
  `;
  return wrapDevPortal({
    active: "api",
    title: "Documentation API — intégration caisse &amp; borne",
    bodyHtml: body,
  });
}

export function renderDevelopersInnovorderPage() {
  const emailInnovorder = `Bonjour,

Je suis Thomas Dafonseca Ribeiro, cofondateur de MyFidpass (https://www.myfidpass.fr).

Nous proposons des cartes fidélité Apple Wallet et Google Wallet pour les restaurateurs. Le client scanne son pass Wallet — aucune app à installer.

MyFidpass en bref :
• App iOS commerçant sur l'App Store
• Plus de 200 commerces équipés en France
• Scan Wallet sur borne (sans saisie de téléphone)
• Plusieurs de nos clients ont déjà des bornes Innovorder

Nous souhaitons intégrer MyFidpass à votre marketplace fidélité et à vos bornes : scan QR → crédit points à la validation du ticket.

Doc technique : https://www.myfidpass.fr/developers/api

Pilote prêt : NBK Naanerie à Rennes (client Innovorder, accord du franchisé pour tester).
https://www.innovorder.com/success-stories/nbk-innovorder

Disponible pour un call de 30 min avec votre équipe Intégrations ?

Thomas Dafonseca Ribeiro
06 04 53 21 21
contact@myfidpass.fr`;

  const body = `
    <p class="dev-portal-lead">
      Ce guide prépare le <strong>partenariat officiel Innovorder</strong> pour afficher MyFidpass
      dans l'écosystème Innovorder (bornes + caisse + click &amp; collect).
    </p>

    <section class="landing-legal-section dev-portal-highlight">
      <h2>Pilote : NBK Rennes</h2>
      <ul>
        <li><strong>Enseigne :</strong> NBK Naanerie — street food franco-indienne (Naan, Black Naan®)</li>
        <li><strong>Innovorder :</strong> écosystème 360° déjà déployé (caisse, bornes, click &amp; collect) — <a href="https://www.innovorder.com/success-stories/nbk-innovorder" rel="noopener">success story Innovorder</a></li>
        <li><strong>Rennes :</strong> 16 rue du Pré Botté (centre) + La Courrouze</li>
        <li><strong>Statut :</strong> accord du client pour tester MyFidpass dès que l'intégration borne est disponible</li>
        <li><strong>Contact réseau NBK :</strong> Abdullah Alim — développement franchise (abdullah@naanerie.fr)</li>
      </ul>
    </section>

    <section class="landing-legal-section">
      <h2>Ce qu'on demande à Innovorder</h2>
      <ol>
        <li>Listing MyFidpass dans la section <strong>Loyalty</strong> du marketplace Innovorder</li>
        <li>Écran « Fidélité » sur la borne : scan QR Wallet → lookup → commande → scan auto à la validation</li>
        <li>Configuration backoffice : le restaurateur renseigne slug + token MyFidpass (comme les autres partenaires fidélité)</li>
        <li>Environnement sandbox + contact technique dédié</li>
      </ol>
    </section>

    <section class="landing-legal-section">
      <h2>Ce que MyFidpass fournit</h2>
      <ul>
        <li>API REST documentée : <a href="/developers/api">/developers/api</a></li>
        <li>OpenAPI : <a href="/openapi/myfidpass-integration.yaml">myfidpass-integration.yaml</a></li>
        <li>Support intégration : <a href="mailto:${SUPPORT}">${SUPPORT}</a></li>
        <li>Restaurant pilote NBK Rennes pour tests en conditions réelles</li>
      </ul>
    </section>

    <section class="landing-legal-section">
      <h2>Parcours client cible sur borne Innovorder</h2>
      <ol>
        <li>« Programme fidélité » → scan QR Apple/Google Wallet</li>
        <li>Affichage : prénom + solde points (<code>GET /integration/lookup</code>)</li>
        <li>Commande + paiement sur Innovorder</li>
        <li>À la clôture ticket : <code>POST /integration/scan</code> avec <code>amount_eur</code></li>
        <li>Confirmation à l'écran : « +X points »</li>
      </ol>
      <p><strong>Atout MyFidpass :</strong> scan direct du pass Wallet — pas de numéro de téléphone à saisir.</p>
    </section>

    <section class="landing-legal-section">
      <h2>Où contacter Innovorder</h2>
      <ul>
        <li>Page intégrations : <a href="https://en.innovorder.fr/integrations" rel="noopener">innovorder.fr/integrations</a> → « Talk to an expert »</li>
        <li>Contact : <a href="https://en.innovorder.fr/contact-us" rel="noopener">innovorder.fr/contact-us</a></li>
      </ul>
    </section>

    <section class="landing-legal-section">
      <h2>Email prêt à envoyer (Innovorder)</h2>
      <p>Copiez-collez dans le formulaire Innovorder (étape « Votre message ») :</p>
      ${codeBlock(emailInnovorder)}
    </section>

    <section class="landing-legal-section">
      <h2>En attendant le partenariat</h2>
      <p>
        NBK (et tout client Innovorder) peut utiliser MyFidpass <strong>immédiatement</strong> :
        commande sur la borne, scan Wallet avec l'<strong>app MyFidpass</strong> à la caisse.
        L'intégration native remplacera ce geste manuel une fois le partenariat signé.
      </p>
    </section>
  `;
  return wrapDevPortal({
    active: "innovorder",
    title: "Partenariat Innovorder × MyFidpass",
    bodyHtml: body,
  });
}

export function getDeveloperPortalPageHtml(pageSlug) {
  if (pageSlug === "developers") return renderDevelopersHubPage();
  if (pageSlug === "developers-api") return renderDevelopersApiPage();
  if (pageSlug === "developers-partenaires-innovorder") return renderDevelopersInnovorderPage();
  return "";
}
