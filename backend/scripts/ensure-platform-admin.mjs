#!/usr/bin/env node
/**
 * Crée ou promeut un compte administrateur plateforme (`users.is_admin = 1`).
 * Aucune variable d’environnement requise — arguments CLI ou génération auto.
 *
 * Usage local :
 *   node scripts/ensure-platform-admin.mjs --email ops@myfidpass.fr --password 'MonMotDePasse8!'
 *
 * Génération auto (mot de passe aléatoire affiché une fois) :
 *   node scripts/ensure-platform-admin.mjs --generate --email console-admin@myfidpass.fr
 *
 * Production Railway (base SQLite du service API) :
 *   railway run --service fidpass-api node backend/scripts/ensure-platform-admin.mjs --generate --email console-admin@myfidpass.fr
 */
import crypto from "crypto";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { countPlatformAdmins, ensurePlatformAdminAccount } from "../src/db/users.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--generate") {
      out.generate = true;
      continue;
    }
    if (a.startsWith("--") && i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      out[a.slice(2)] = argv[++i];
    }
  }
  return out;
}

function randomPassword() {
  return crypto.randomBytes(18).toString("base64url");
}

const args = parseArgs(process.argv.slice(2));
const generate = args.generate === true;
const email = String(args.email ?? "console-admin@myfidpass.fr")
  .trim()
  .toLowerCase();
let password = String(args.password ?? "");
const name = String(args.name ?? "Administrateur MyFidpass").trim() || "Administrateur MyFidpass";

if (!email.includes("@")) {
  console.error("Email invalide:", email);
  process.exit(1);
}

if (generate || !password) {
  password = randomPassword();
}

const result = ensurePlatformAdminAccount({ email, password, name });
if (!result.ok) {
  console.error("Échec:", result.error);
  process.exit(1);
}

console.log("OK — compte administrateur plateforme prêt.");
console.log("Email     :", result.email);
console.log("Mot de passe:", password);
console.log("Créé      :", result.created ? "oui" : "non (compte existant, mot de passe mis à jour + is_admin=1)");
console.log("Admins en base:", countPlatformAdmins());
console.log("");
console.log("Connexion : POST https://api.myfidpass.fr/api/auth/login");
console.log('Body JSON : { "login": "' + result.email + '", "password": "…" }');
console.log("App iOS   : écran connexion commerçant → même identifiants → hub Administration.");
