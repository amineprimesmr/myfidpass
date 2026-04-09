#!/usr/bin/env node
/**
 * Définit le mot de passe d’un utilisateur existant (hash bcrypt, comme /api/auth).
 * Usage (ne pas commiter le mot de passe) :
 *   SET_PASSWORD='VotreMotDePasse' node scripts/set-user-password.mjs email@domaine.fr
 *
 * Prod Railway (exemple, depuis le dossier du projet lié à Railway) :
 *   railway run --service fidpass-api SET_PASSWORD='…' node backend/scripts/set-user-password.mjs contact@myfidpass.fr
 */
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import bcrypt from "bcryptjs";
import { getUserByEmail, updateUserPassword } from "../src/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

const SALT_ROUNDS = 10;
const emailRaw = process.argv[2];
const password = process.env.SET_PASSWORD;

if (!emailRaw || !password) {
  console.error("Usage: SET_PASSWORD='…' node scripts/set-user-password.mjs <email>");
  process.exit(1);
}

const email = String(emailRaw).trim().toLowerCase();
const user = getUserByEmail(email);
if (!user) {
  console.error("Utilisateur introuvable (inscrivez-vous d’abord avec cet email):", email);
  process.exit(1);
}

const passwordHash = await bcrypt.hash(String(password), SALT_ROUNDS);
const ok = updateUserPassword(user.id, passwordHash);
if (!ok) {
  console.error("Échec mise à jour mot de passe.");
  process.exit(1);
}

console.log("OK — mot de passe mis à jour pour:", user.email);
