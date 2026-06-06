/**
 * Création compte commerçant + 1er commerce par un admin plateforme (sans Google Places).
 */
import bcrypt from "bcryptjs";
import {
  createUser,
  createUserWithEmailOtp,
  getUserByEmail,
  getUserById,
  isUserAdmin,
  isReservedStaffEmailOnly,
} from "../db/users.js";
import { createBusiness, getBusinessBySlug } from "../db/businesses.js";

const SALT_ROUNDS = 10;

function registerSlugFromName(name) {
  let s = String(name || "commerce")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s.slice(0, 48) || "commerce";
}

function normalizeSlugInput(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function allocateUniqueSlug(base) {
  let slug = base;
  let suffix = 0;
  while (getBusinessBySlug(slug)) {
    suffix += 1;
    slug = `${base}-${suffix}`.slice(0, 60);
  }
  return slug;
}

/**
 * @param {{
 *   email: string,
 *   ownerName?: string | null,
 *   businessName: string,
 *   slug?: string | null,
 *   organizationName?: string | null,
 *   password?: string | null,
 * }} input
 */
export async function provisionMerchantAccountByAdmin(input) {
  const email = String(input?.email ?? "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, code: "email_invalid", error: "E-mail propriétaire invalide." };
  }
  if (isReservedStaffEmailOnly(email)) {
    return { ok: false, code: "email_reserved", error: "Adresse e-mail non autorisée." };
  }

  const businessName = String(input?.businessName ?? "").trim();
  if (!businessName) {
    return { ok: false, code: "business_name_required", error: "Nom du commerce requis." };
  }

  const ownerName = String(input?.ownerName ?? "").trim() || null;
  const organizationName = String(input?.organizationName ?? "").trim() || businessName;

  let baseSlug = normalizeSlugInput(input?.slug);
  if (!baseSlug) baseSlug = registerSlugFromName(businessName);
  if (!baseSlug || baseSlug.length < 2) {
    return { ok: false, code: "slug_invalid", error: "Slug invalide (min. 2 caractères, a-z, 0-9, tirets)." };
  }

  const slug = allocateUniqueSlug(baseSlug);
  if (input?.slug && slug !== baseSlug) {
    return {
      ok: false,
      code: "slug_taken",
      error: "Ce slug est déjà pris. Choisissez-en un autre ou laissez le champ vide pour en générer un.",
    };
  }

  let user = getUserByEmail(email);
  let userCreated = false;

  if (user) {
    if (isUserAdmin(user)) {
      return {
        ok: false,
        code: "cannot_provision_admin",
        error: "Impossible de rattacher un commerce à un compte administrateur plateforme.",
      };
    }
  } else {
    const password = String(input?.password ?? "");
    try {
      if (password.length >= 8) {
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        user = createUser({ email, passwordHash, name: ownerName });
      } else {
        user = createUserWithEmailOtp({ email, name: ownerName });
      }
      userCreated = true;
    } catch (e) {
      const code = String(e?.code || "");
      if (code === "EMAIL_TAKEN") {
        return { ok: false, code: "email_taken", error: "Un compte existe déjà avec cet e-mail." };
      }
      if (code === "EMAIL_INVALID") {
        return { ok: false, code: "email_invalid", error: "E-mail propriétaire invalide." };
      }
      throw e;
    }
  }

  const business = createBusiness({
    name: businessName,
    slug,
    organizationName,
    userId: user.id,
  });

  return {
    ok: true,
    user_created: userCreated,
    user: getUserById(user.id),
    business,
  };
}
