# Bilan A–Z — Projet Fidpass (100 % cru et honnête)

**Date :** 2026-03-17  
**Périmètre :** Tout le projet (frontend, backend, config, scripts, docs).  
**Objectif :** État des lieux brut pour préparer la refonte et les règles à respecter.

---

## A. Architecture globale

| Élément | État | Verdict |
|--------|------|--------|
| Séparation backend / frontend | Backend Node/Express, frontend Vite/React | OK |
| Déploiement | Vercel (front) + Railway (back), scripts deploy | OK |
| Monorepo | Racine + backend + frontend (npm install x3) | OK mais pas de workspace npm |
| Point d’entrée front | Un seul : index.html → main.js | **PROBLÈME** — tout passe par un fichier géant |
| Point d’entrée back | index.js → routes | OK |

**Résumé A :** L’architecture “2 apps + scripts” tient la route, mais le front est conçu comme une seule grosse app monolithique (1 HTML + 1 JS). Aucun découpage par domaine ou par écran.

---

## B. Backend — Fichiers et responsabilités

| Fichier | Lignes | Rôle | Verdict |
|---------|--------|------|--------|
| **db.js** | 2 092 | Schéma SQLite + migrations + toutes les requêtes (users, businesses, members, passes, etc.) | **PROBLÈME** — tout dans un fichier, impossible à maintenir et à tester unitairement |
| **routes/businesses.js** | 2 403 | Toutes les routes commerces (dashboard, membres, jeux, config, notifications, etc.) | **PROBLÈME** — route monolithique, mélange HTTP et logique métier |
| **pass.js** | 1 076 | Génération complète des passes Apple (signature, images, champs) | **PROBLÈME** — trop long, à découper en sous-modules |
| **routes/auth.js** | 451 | Login, register, OAuth, reset password | Limite haute mais acceptable |
| **index.js** | 196 | CORS, rate limit, montage routes, 404, erreur globale | OK |
| **Autres routes** | 21–303 | device, payment, passes, web-push, places, dev, etc. | OK |

**Résumé B :** Trois fichiers (db, businesses, pass) concentrent l’essentiel du backend. Pas de couche “service” ou “repository” claire ; la logique est noyée dans les routes et dans db.js. Tests présents (auth, payment, lib) mais couverture faible par rapport à la taille du code.

---

## C. Frontend — Fichiers et responsabilités

| Fichier / zone | Lignes / taille | Rôle | Verdict |
|----------------|-----------------|------|--------|
| **main.js** | 7 944 (~373 Ko) | Routage, auth, landing, builder, checkout, dashboard, app caisse, app client, erreurs, géocodage, formulaires, etc. | **PROBLÈME CRITIQUE** — tout l’app dans un fichier ; ~61 blocs fonctionnels ; HMR inutile ; chaque sauvegarde = retraitement total |
| **index.html** | 2 450 (~190 Ko) | Markup de toutes les vues (landing, auth, builder, checkout, dashboard, app, fidelity, 404, légales) | **PROBLÈME CRITIQUE** — HTML monolithique ; aucune composantisation |
| **app.css** | 4 697 (~135 Ko) | Styles app (caisse, membres, jeux, etc.) | **PROBLÈME** — une seule grosse feuille |
| **landing.css** | 4 631 (~114 Ko) | Styles landing / builder | **PROBLÈME** — idem |
| **style.css** | 1 630 (~36 Ko) | Styles globaux | Gros mais cohérent “global” |
| **auth.css** | 585 | Auth | > 500 lignes |
| **dashboard.css** | 294 | Dashboard | OK |
| **app-mobile.css** | 408 | Mobile | OK |
| **config.js** | 77 | API_BASE, auth, dev bypass | OK |
| **utils/apiError.js** | ~50 | Erreurs API, escape HTML | OK |
| **client-fidelity/** | ~13k lignes (multi-fichiers) | App carte fidélité client (bootstrap, store, api, view) | Structure correcte, mais chargée depuis main.js |
| **components/** (JSX) | Variable | Carousel, sidebar, helmet, etc. | Certains en import dynamique (bien), d’autres non |
| **depth-gallery/, helmet/** | Gros (Three.js, R3F) | Démo 3D | Déjà en “îlots” mais dépendent du reste |

**Résumé C :** Le front repose sur deux piliers monolithiques (main.js + index.html) et deux très gros CSS (app, landing). Aucun découpage par écran ni par feature. Conséquence directe : lenteur en dev (chaque modif = tout retraiter), HMR inefficace, maintenance difficile.

---

## D. Dépendances et build

| Zone | État | Verdict |
|------|------|--------|
| Build front | Vite 5, 7117 modules transformés, chunks > 500 Ko | **PROBLÈME** — graphe énorme, pas de code splitting par route |
| Deps lourdes | html5-qrcode (import statique), three, R3F, framer-motion, etc. | **PROBLÈME** — certaines chargées au démarrage alors qu’elles ne servent que sur un écran |
| Tailwind | Scan de main.js (8k lignes) + index.html (2,5k lignes) | **PROBLÈME** — beaucoup de contenu à scanner |
| optimizeDeps | include ajouté (html5-qrcode, three, react) | Amélioration récente, insuffisant sans découpage |

**Résumé D :** Le nombre de modules et l’absence de découpage rendent le build et le dev lents. Les grosses libs devraient être chargées à la demande (écran scanner, écran 3D, etc.).

---

## E. Qualité et outillage

| Élément | État | Verdict |
|---------|------|--------|
| ESLint | Racine : backend + frontend/src + scripts, fichiers `**/*.js` uniquement | **PROBLÈME** — .jsx et .ts non lintés |
| Tests backend | Vitest, auth.test.js, payment.test.js, lib.test.js ; certains tests “hang” | Partiel ; pas de stratégie de tests frontend |
| Tests frontend | Aucun | **PROBLÈME** |
| Prettier / format | Non configuré à la racine | Manquant (optionnel mais utile) |
| TypeScript | Quelques .ts (utils, hooks) dans le front, pas de config TS globale | Incohérent (mélange JS/TS) |

**Résumé E :** Qualité et outillage sont en retard : pas de tests frontend, ESLint incomplet, pas de convention de format imposée.

---

## F. Sécurité et prod

| Élément | État | Verdict |
|---------|------|--------|
| Secrets prod | JWT_SECRET, PASSKIT_SECRET vérifiés au démarrage (exit si manquants) | OK (déjà corrigé) |
| Rate limiting | Auth (login/register), création membres | OK |
| CORS, Helmet | Configurés | OK |
| Bypass paiement | Désactivé en prod (DEV_BYPASS_PAYMENT) | OK |
| Reset dev | Route /api/dev/reset protégée par RESET_SECRET | OK |

**Résumé F :** Les correctifs post-audit sont en place. La doc (SECURITE.md, CONNEXION-PROD.md) existe.

---

## G. Scripts et déploiement

| Élément | État | Verdict |
|---------|------|--------|
| deploy.sh | git add, commit “Deploy: …”, push | OK |
| start-all.mjs | Backend + frontend en parallèle | OK |
| start-dev.sh | Affiche port 5173 alors que Vite = 5174 | **PROBLÈME** mineur — incohérence |
| render.yaml | Présent alors que prod = Railway | Confus (à clarifier ou supprimer) |

**Résumé G :** Fonctionnel avec une petite incohérence d’affichage et une config Render inutile si tout est sur Railway.

---

## H. Documentation

| Doc | Rôle | Verdict |
|-----|------|--------|
| AUDIT-COMPLET-2025.md, PLAN-ACTION-AUDIT.md | Audit et plan d’action | OK |
| SECURITE.md, CONNEXION-PROD.md | Sécurité et dépannage connexion | OK |
| LENTEUR-DEV.md | Explication lenteur en dev | OK |
| README (racine, backend) | Description et tests | Partiel |

**Résumé H :** La doc projet et sécurité est correcte. Il manque une doc “architecture” et “règles de refonte” (c’est l’objet du programme de règles).

---

## Synthèse — Verdict global

| Critère | Note | Commentaire |
|---------|------|-------------|
| **Architecture** | 4/10 | Backend/front séparés, mais front monolithique (1 JS + 1 HTML énormes). |
| **Maintenabilité** | 3/10 | Fichiers de 2k–8k lignes, responsabilités mélangées, pas de découpage par feature. |
| **Vitesse en dev** | 2/10 | Chaque modif = retraitement de milliers de lignes et de 7k+ modules ; HMR inutile. |
| **Qualité (lint, tests)** | 4/10 | ESLint partiel, tests backend limités, pas de tests frontend. |
| **Sécurité** | 7/10 | Secrets, rate limit, CORS, bypass désactivé en prod. |
| **Documentation** | 6/10 | Audits et sécurité documentés ; pas de doc d’architecture ni de règles de code. |

**Conclusion :** Le projet fonctionne en prod et la sécurité de base est en place, mais la base de code est **monolithique et non structurée pour la vélocité**. Une refonte avec des **règles strictes** (taille de fichier, découpage, code splitting, chargement à la demande) est nécessaire pour atteindre un projet “ultra rapide quand on fait des modifications” et propre à long terme.

---

## Suite

- **Programme de règles fixes :** [REFONTE-REGLES.md](./REFONTE-REGLES.md) — à respecter coûte que coûte pendant et après la refonte.
- **Pistes techniques détaillées :** [LENTEUR-DEV.md](./LENTEUR-DEV.md), [PLAN-ACTION-AUDIT.md](./PLAN-ACTION-AUDIT.md).
