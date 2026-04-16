/**
 * Middleware de validation d'inputs avec Zod.
 *
 * Usage :
 *   import { validate, schemas } from "../lib/validate.js";
 *   router.post("/register", validate(schemas.register), async (req, res) => { ... });
 *
 * En cas d'erreur : retourne { error: "Validation", details: { field: ["message"] } }
 */

import { z } from "zod";

// ── Middleware générique ────────────────────────────────────────────────────

/**
 * Retourne un middleware Express qui valide `req.body` contre le schéma Zod.
 * Si la validation réussit, `req.body` est remplacé par la valeur parsée (nettoyée).
 */
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.flatten().fieldErrors;
      return res.status(400).json({
        error: "Validation",
        details,
        // Message humain du premier champ invalide (pour l'affichage UI)
        message: Object.values(details).flat()[0] ?? "Données invalides",
      });
    }
    // Remplacer req.body par la version parsée (trimming, coercions Zod appliqués)
    req.body = result.data;
    next();
  };
}

// ── Schémas de validation ──────────────────────────────────────────────────

const emailSchema = z
  .string({ required_error: "Email requis" })
  .email("Format d'email invalide")
  .max(254, "Email trop long")
  .transform((v) => v.trim().toLowerCase());

const passwordSchema = z
  .string({ required_error: "Mot de passe requis" })
  .min(12, "Le mot de passe doit contenir au moins 12 caractères")
  .max(128, "Mot de passe trop long (128 caractères max)");

const optionalPlaceIdSchema = z.string().trim().max(300).optional().nullable();
const optionalEstablishmentNameSchema = z.string().trim().max(100).optional().nullable();

export const schemas = {

  // POST /auth/register
  register: z.object({
    email: emailSchema,
    password: passwordSchema,
    name: z.string().trim().max(100, "Nom trop long (100 caractères max)").optional().nullable(),
    google_place_id: optionalPlaceIdSchema,
    googlePlaceId: optionalPlaceIdSchema,
    establishment_name: optionalEstablishmentNameSchema,
    establishmentName: optionalEstablishmentNameSchema,
  }).superRefine((data, ctx) => {
    const placeId = String(data.google_place_id || data.googlePlaceId || "").trim();
    const establishmentName = String(data.establishment_name || data.establishmentName || "").trim();
    if (!placeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["google_place_id"],
        message: "Sélectionnez votre établissement avant de créer votre compte.",
      });
    }
    if (!establishmentName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["establishment_name"],
        message: "Le nom de l'établissement est requis.",
      });
    }
  }),

  // POST /auth/login
  login: z.object({
    email: emailSchema,
    password: z.string({ required_error: "Mot de passe requis" }).min(1, "Mot de passe requis").max(128),
  }),

  // POST /auth/check-email — existence d’un compte (flux connexion / inscription app)
  checkEmail: z.object({
    email: emailSchema,
  }),

  // POST /auth/forgot-password
  forgotPassword: z.object({
    email: emailSchema,
  }),

  // POST /auth/reset-password
  resetPassword: z.object({
    token: z.string({ required_error: "Token requis" }).min(1, "Token requis").max(200),
    newPassword: passwordSchema,
  }),

  // POST /businesses/:slug/members
  createMember: z.object({
    email: emailSchema,
    name: z.string({ required_error: "Nom requis" }).trim().min(1, "Nom requis").max(100, "Nom trop long"),
    phone: z.string().trim().max(30).optional().nullable(),
    city: z.string().trim().max(80).optional().nullable(),
    birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format date invalide (YYYY-MM-DD)").optional().nullable(),
  }),

  /** POST /businesses/:slug/members/:memberId/claim-identity — finalisation compte invité (QR roue). */
  claimGuestIdentity: z.object({
    name: z.string({ required_error: "Nom requis" }).trim().min(1, "Nom requis").max(100, "Nom trop long"),
    email: emailSchema,
  }),

  // POST /businesses/:slug/members/:memberId/points
  addPoints: z.object({
    points: z.number().int().positive().max(100_000, "Valeur trop élevée").optional(),
    amount_eur: z.number().positive().max(100_000, "Montant trop élevé").optional(),
    visit: z.boolean().optional(),
  }).refine(
    (data) => data.points != null || data.amount_eur != null || data.visit != null,
    { message: "Fournir au moins : points, amount_eur ou visit" }
  ),

  /** POST /auth/phone/send-code */
  phoneSend: z.object({
    phone: z
      .string({ required_error: "Numéro requis" })
      .min(8, "Numéro trop court")
      .max(32, "Numéro trop long"),
  }),

  /** POST /auth/phone/verify — établissement requis seulement à la création de compte (contrôlé côté route). */
  phoneVerify: z.object({
    phone: z.string({ required_error: "Numéro requis" }).min(8).max(32),
    code: z
      .string({ required_error: "Code requis" })
      .regex(/^\d{6}$/, "Code à 6 chiffres"),
    google_place_id: optionalPlaceIdSchema,
    googlePlaceId: optionalPlaceIdSchema,
    establishment_name: optionalEstablishmentNameSchema,
    establishmentName: optionalEstablishmentNameSchema,
  }),

  // POST /businesses (création)
  createBusiness: z.object({
    name: z.string({ required_error: "Nom requis" }).trim().min(1, "Nom requis").max(100, "Nom trop long"),
    slug: z
      .string({ required_error: "Slug requis" })
      .trim()
      .min(2, "Slug trop court")
      .max(60, "Slug trop long")
      .regex(/^[a-z0-9-]+$/, "Slug invalide : lettres minuscules, chiffres et tirets uniquement"),
    organizationName: z.string().trim().max(100).optional().nullable(),
    backTerms: z.string().trim().max(1000).optional().nullable(),
    backContact: z.string().trim().max(200).optional().nullable(),
  }),
};
