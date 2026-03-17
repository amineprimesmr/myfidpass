/**
 * Contenu HTML des pages légales (mentions, politique, CGU, CGV, cookies).
 * Référence : REFONTE-REGLES.md — max 400 lignes par fichier.
 */

const LEGAL_EDITOR = {
  name: "Myfidpass",
  address: "[Adresse du siège à compléter]",
  contact: "contact@myfidpass.fr",
  host: "[Hébergeur à compléter, ex. Vercel / Railway / OVH]",
  site: "https://myfidpass.fr",
};

export function getMentionsLegalesHtml() {
  const e = LEGAL_EDITOR;
  return `
    <h1>Mentions légales</h1>
    <p><strong>Éditeur du site</strong><br>${e.name}<br>${e.address}</p>
    <p><strong>Contact</strong><br><a href="mailto:${e.contact}">${e.contact}</a></p>
    <p><strong>Hébergement</strong><br>${e.host}</p>
    <p>Conformément à la loi « Informatique et Libertés » et au RGPD, vous disposez d'un droit d'accès, de rectification et de suppression de vos données. Voir notre <a href="/politique-confidentialite">Politique de confidentialité</a>.</p>
    <p>Les présentes mentions légales sont régies par le droit français.</p>
    <nav class="landing-legal-nav">
      <a href="/politique-confidentialite">Politique de confidentialité</a>
      <a href="/cgu">Conditions générales d'utilisation</a>
      <a href="/cgv">Conditions générales de vente</a>
      <a href="/cookies">Cookies</a>
      <a href="/">Retour à l'accueil</a>
    </nav>
  `;
}

export function getPolitiqueConfidentialiteHtml() {
  const e = LEGAL_EDITOR;
  return `
    <h1>Politique de confidentialité</h1>
    <p>Dernière mise à jour : mars 2026.</p>
    <p>${e.name} s'engage à protéger vos données personnelles conformément au RGPD.</p>
    <h2>Responsable du traitement</h2>
    <p>${e.name}, ${e.address}. Contact : <a href="mailto:${e.contact}">${e.contact}</a>.</p>
    <h2>Données collectées</h2>
    <p>Nous collectons les données nécessaires au service : identifiants de connexion (email, mot de passe hashé), nom ou raison sociale, données de votre établissement (nom, adresse, logo, paramètres de carte fidélité). Pour les clients finaux qui ajoutent une carte au Wallet : identifiant de membre, points ou tampons, historique de passage (pour le commerçant).</p>
    <h2>Finalités et bases légales</h2>
    <p>Les données servent à la fourniture du service (carte fidélité Apple Wallet / Google Wallet, tableau de bord, notifications), à la facturation et au support. Base : exécution du contrat et intérêt légitime.</p>
    <h2>Durée de conservation</h2>
    <p>Données compte : tant que le compte est actif, puis possibilité d'archivage limité. Données membres (côté commerçant) : selon la durée choisie par le commerçant. Vous pouvez demander l'effacement à tout moment.</p>
    <h2>Vos droits (RGPD)</h2>
    <p>Accès, rectification, effacement, limitation du traitement, portabilité, opposition. Pour exercer vos droits : <a href="mailto:${e.contact}">${e.contact}</a>. Vous pouvez introduire une réclamation auprès de la CNIL.</p>
    <h2>Transferts et sous-traitants</h2>
    <p>Les données peuvent être hébergées ou traitées par des sous-traitants (hébergeur, paiement, envoi d'emails). Nous choisissons des acteurs conformes au RGPD.</p>
    <nav class="landing-legal-nav">
      <a href="/mentions-legales">Mentions légales</a>
      <a href="/cgu">CGU</a>
      <a href="/cgv">CGV</a>
      <a href="/cookies">Cookies</a>
      <a href="/">Retour à l'accueil</a>
    </nav>
  `;
}

export function getCguHtml() {
  const e = LEGAL_EDITOR;
  return `
    <h1>Conditions générales d'utilisation (CGU)</h1>
    <p>Dernière mise à jour : mars 2026.</p>
    <p>L'accès et l'utilisation du site ${e.site} et des services Myfidpass sont soumis aux présentes conditions générales d'utilisation.</p>
    <h2>1. Objet et acceptation</h2>
    <p>En utilisant le site et les services (création de compte, carte fidélité, tableau de bord, application mobile), vous acceptez les présentes CGU sans réserve. Si vous n'acceptez pas ces conditions, ne pas utiliser le service.</p>
    <h2>2. Description du service</h2>
    <p>Myfidpass permet aux commerçants de créer et gérer des cartes de fidélité compatibles Apple Wallet et Google Wallet, d'enregistrer les passages (scans), d'envoyer des notifications et de gérer des catégories de membres. Les clients finaux peuvent ajouter la carte à leur téléphone et la présenter en caisse.</p>
    <h2>3. Inscription et compte</h2>
    <p>Vous devez fournir des informations exactes. Vous êtes responsable de la confidentialité de vos identifiants. En cas d'usage non autorisé, nous prévenir sans délai.</p>
    <h2>4. Usage acceptable</h2>
    <p>Vous vous engagez à utiliser le service de manière licite, à ne pas porter atteinte aux droits de tiers, à ne pas tenter de contourner les mesures de sécurité ni d'utiliser le service pour du spam ou des usages frauduleux.</p>
    <h2>5. Propriété intellectuelle</h2>
    <p>Le site, les marques, textes et logiciels restent la propriété de ${e.name}. Aucune cession de droits n'est accordée au-delà de l'usage du service.</p>
    <h2>6. Limitation de responsabilité</h2>
    <p>Le service est fourni « en l'état ». Nous nous efforçons d'assurer sa disponibilité mais ne garantissons pas une continuité sans interruption. La responsabilité est limitée aux dommages directs et prévisibles.</p>
    <h2>7. Modification et résiliation</h2>
    <p>Nous pouvons modifier les CGU ; les changements seront portés à votre connaissance (site ou email). L'utilisation continue vaut acceptation. Nous pouvons suspendre ou résilier un compte en cas de manquement aux CGU.</p>
    <h2>8. Droit applicable et litiges</h2>
    <p>Droit français. Litiges : compétence des tribunaux français. Contact : <a href="mailto:${e.contact}">${e.contact}</a>.</p>
    <nav class="landing-legal-nav">
      <a href="/mentions-legales">Mentions légales</a>
      <a href="/politique-confidentialite">Politique de confidentialité</a>
      <a href="/cgv">CGV</a>
      <a href="/cookies">Cookies</a>
      <a href="/">Retour à l'accueil</a>
    </nav>
  `;
}

export function getCgvHtml() {
  const e = LEGAL_EDITOR;
  return `
    <h1>Conditions générales de vente (CGV)</h1>
    <p>Dernière mise à jour : mars 2026.</p>
    <p>Les présentes CGV s'appliquent aux abonnements et prestations proposés par ${e.name} sur le site ${e.site}.</p>
    <h2>1. Produits et offres</h2>
    <p>Les offres (abonnement mensuel, essai gratuit) sont décrites sur le site au moment de la souscription. Les prix sont en euros TTC sauf mention contraire. Nous nous réservons le droit d'ajuster les tarifs en communiquant préalablement aux abonnés.</p>
    <h2>2. Souscription et paiement</h2>
    <p>La souscription se fait en ligne. Le paiement est sécurisé (partenaire type Stripe). En cas d'essai gratuit, le prélèvement débute à l'issue de la période d'essai sauf annulation. Vous vous engagez à maintenir un moyen de paiement valide.</p>
    <h2>3. Droit de rétractation</h2>
    <p>Conformément à la loi, vous disposez de 14 jours à compter de la souscription pour exercer votre droit de rétractation, sans avoir à justifier de motif. Pour ce faire : <a href="mailto:${e.contact}">${e.contact}</a>. En cas de rétractation, les sommes déjà versées seront remboursées.</p>
    <h2>4. Résiliation et remboursement</h2>
    <p>Vous pouvez résilier votre abonnement à tout moment (depuis l'espace client ou par email). La résiliation prend effet en fin de période en cours ; aucun remboursement partiel pour la période déjà facturée. En cas de manquement grave de notre part, un remboursement pourra être envisagé.</p>
    <h2>5. Prestations et disponibilité</h2>
    <p>Nous nous engageons à fournir le service décrit (carte fidélité, tableau de bord, API, application) avec un niveau de disponibilité raisonnable. Les maintenances éventuelles seront annoncées lorsque possible.</p>
    <h2>6. Données et facturation</h2>
    <p>Les données de facturation sont traitées conformément à notre <a href="/politique-confidentialite">Politique de confidentialité</a>. Les factures sont disponibles dans l'espace client ou sur demande.</p>
    <h2>7. Droit applicable et contact</h2>
    <p>Droit français. Pour toute question : <a href="mailto:${e.contact}">${e.contact}</a>.</p>
    <nav class="landing-legal-nav">
      <a href="/mentions-legales">Mentions légales</a>
      <a href="/politique-confidentialite">Politique de confidentialité</a>
      <a href="/cgu">CGU</a>
      <a href="/cookies">Cookies</a>
      <a href="/">Retour à l'accueil</a>
    </nav>
  `;
}

export function getCookiesHtml() {
  const e = LEGAL_EDITOR;
  return `
    <h1>Politique de cookies</h1>
    <p>Dernière mise à jour : mars 2026.</p>
    <p>Ce site utilise des cookies et technologies similaires pour le bon fonctionnement du service et, le cas échéant, l'analyse d'audience.</p>
    <h2>Qu'est-ce qu'un cookie ?</h2>
    <p>Un cookie est un petit fichier déposé par le navigateur sur votre appareil, permettant de mémoriser des informations (session, préférences, statistiques).</p>
    <h2>Cookies utilisés</h2>
    <ul>
      <li><strong>Cookies essentiels</strong> : session de connexion, sécurité, préférences indispensables. Ils sont nécessaires au fonctionnement du site ; leur refus peut dégrader l'expérience.</li>
      <li><strong>Cookies d'analyse</strong> (si applicable) : mesure d'audience (ex. outil type Google Analytics ou équivalent). Vous pouvez les refuser via notre bandeau ou les paramètres de votre navigateur.</li>
    </ul>
    <h2>Durée et refus</h2>
    <p>La durée de conservation des cookies est limitée (session ou durée définie selon le type). Vous pouvez configurer votre navigateur pour refuser certains ou tous les cookies ; certaines fonctionnalités peuvent alors ne plus être disponibles.</p>
    <h2>Vos droits</h2>
    <p>Conformément au RGPD et à la recommandation CNIL, vous pouvez à tout moment retirer votre consentement ou modifier vos préférences. Pour toute question : <a href="mailto:${e.contact}">${e.contact}</a>.</p>
    <nav class="landing-legal-nav">
      <a href="/mentions-legales">Mentions légales</a>
      <a href="/politique-confidentialite">Politique de confidentialité</a>
      <a href="/cgu">CGU</a>
      <a href="/cgv">CGV</a>
      <a href="/">Retour à l'accueil</a>
    </nav>
  `;
}

export function getLegalPageHtml(page) {
  switch (page) {
    case "mentions":
      return getMentionsLegalesHtml();
    case "politique":
      return getPolitiqueConfidentialiteHtml();
    case "cgu":
      return getCguHtml();
    case "cgv":
      return getCgvHtml();
    case "cookies":
      return getCookiesHtml();
    default:
      return "";
  }
}
