/**
 * Équipe commerçant : GET /team, POST /team/invites, POST /team/staff-accounts, DELETE /team/members/:id
 */
import { Router } from "express";
import {
  getUserByEmail,
  listTeamMembersForBusinessIncludingOwner,
  getLoyaltyStatsByActorForBusiness,
  addTeamMember,
  findActiveTeamMembership,
  isOnlyTeamUser,
} from "../../db/business-team.js";
import {
  isUserAdmin,
  createUserWithEmailOtp,
  getUserById,
  isReservedStaffEmailOnly,
} from "../../db/users.js";
import { getDb } from "../../db/connection.js";
import { deleteUserAccount } from "../../db.js";
import { sendMail, isEmailConfigured } from "../../email.js";
import { validate, schemas } from "../../lib/validate.js";

const db = getDb();
const router = Router({ mergeParams: true });

function ensureTeamManager(req, res) {
  if (!req.user) {
    res.status(401).json({ error: "Authentification requise" });
    return false;
  }
  const b = req.business;
  if (!b) {
    res.status(404).json({ error: "Entreprise introuvable" });
    return false;
  }
  if (isUserAdmin(req.user)) return true;
  if (String(b.user_id) === String(req.user.id)) return true;
  if (req.workspaceTeamRole === "manager") return true;
  res.status(403).json({ error: "Réservé au responsable du commerce.", code: "forbidden" });
  return false;
}

function serializeMember(r) {
  return {
    membership_id: r.membership_id ?? null,
    user_id: r.user_id ?? null,
    email: r.staff_login ? null : (r.email ?? null),
    staff_login: r.staff_login ?? null,
    name: r.name ?? null,
    role: r.role ?? null,
    status: r.status ?? null,
    created_at: r.created_at ?? null,
  };
}

async function sendTeamAccessEmail({ to, shopName, inviterLabel, role }) {
  const roleLabel = role === "manager" ? "gérant" : "employé";
  return sendMail({
    to,
    subject: `Accès équipe — ${shopName} (MyFidpass)`,
    text: `Bonjour,\n\n${inviterLabel} vous a donné l'accès ${roleLabel} pour le commerce « ${shopName} » sur MyFidpass.\n\nOuvrez l'app MyFidpass, entrez votre e-mail ${to} et saisissez le code reçu par e-mail pour vous connecter.\n\n— MyFidpass`,
    html: `<p>Bonjour,</p><p><strong>${inviterLabel}</strong> vous a donné l'accès <strong>${roleLabel}</strong> pour le commerce « <strong>${shopName}</strong> » sur MyFidpass.</p><p>Ouvrez l'app MyFidpass, entrez votre e-mail <strong>${to}</strong> et saisissez le code reçu par e-mail pour vous connecter.</p><p>— MyFidpass</p>`,
  });
}

/**
 * POST /dashboard/team/staff-accounts
 * Crée ou rattache un employé par e-mail réel (connexion OTP).
 */
router.post("/staff-accounts", validate(schemas.teamStaffAccount), async (req, res) => {
  if (!ensureTeamManager(req, res)) return;
  const business = req.business;
  const emailNorm = req.body.email;
  const nameHint = req.body.name ? String(req.body.name).trim() : null;
  const roleR = String(req.body.role || "staff").toLowerCase() === "manager" ? "manager" : "staff";

  if (isReservedStaffEmailOnly(emailNorm)) {
    return res.status(400).json({ error: "Adresse e-mail invalide.", code: "email_reserved" });
  }

  let user = getUserByEmail(emailNorm);
  let created = false;
  if (!user) {
    try {
      user = createUserWithEmailOtp({ email: emailNorm, name: nameHint });
      created = true;
    } catch (e) {
      const c = e?.code;
      if (c === "EMAIL_TAKEN") {
        user = getUserByEmail(emailNorm);
      } else if (c === "EMAIL_INVALID" || c === "EMAIL_RESERVED") {
        return res.status(400).json({ error: "Adresse e-mail invalide.", code: c });
      } else {
        console.error("[team] staff-accounts create:", e);
        return res.status(500).json({ error: "Impossible de créer le compte employé." });
      }
    }
  }

  if (!user) {
    return res.status(500).json({ error: "Impossible de créer le compte employé." });
  }

  if (String(user.id) === String(business.user_id)) {
    return res.status(400).json({ error: "Le propriétaire du commerce a déjà tous les accès." });
  }

  const ex = db
    .prepare("SELECT 1 FROM business_team_members WHERE business_id = ? AND user_id = ?")
    .get(business.id, user.id);
  if (ex) {
    return res.status(409).json({ error: "Cet utilisateur a déjà accès à ce commerce." });
  }

  if (nameHint && !String(user.name || "").trim()) {
    try {
      db.prepare("UPDATE users SET name = ? WHERE id = ?").run(nameHint, user.id);
      user = getUserById(user.id);
    } catch (_) {}
  }

  addTeamMember({
    businessId: business.id,
    userId: user.id,
    role: roleR,
    invitedBy: req.user.id,
  });

  const shopName = String(
    business.name || business.organization_name || business.slug || "Votre commerce",
  ).trim();
  const inviterLabel = String(req.user.name || "").trim() || req.user.email || "Le responsable";
  const { sent: emailSent } = await sendTeamAccessEmail({
    to: emailNorm,
    shopName,
    inviterLabel,
    role: roleR,
  });
  if (!emailSent && isEmailConfigured()) {
    console.warn("[Team] staff-accounts: échec d'envoi e-mail (voir logs [Email])");
  } else if (!emailSent) {
    console.warn("[Team] staff-accounts: aucun e-mail (définir RESEND_API_KEY ou SMTP sur le serveur)");
  }

  return res.status(created ? 201 : 200).json({
    ok: true,
    user_id: user.id,
    email: emailNorm,
    email_sent: emailSent,
    message: created
      ? "Employé ajouté. Un e-mail lui indique comment se connecter avec son adresse et le code reçu."
      : "Accès employé activé. L'utilisateur recevra un e-mail pour se connecter avec un code.",
  });
});

/** GET /dashboard/team — chaque membre inclut compteurs caisse / fidélité (si `actor_user_id` renseigné sur les transactions). */
router.get("/", (req, res) => {
  if (!ensureTeamManager(req, res)) return;
  const business = req.business;
  const rows = listTeamMembersForBusinessIncludingOwner(business);
  const statsByUser = getLoyaltyStatsByActorForBusiness(business.id);
  const members = rows.map((r) => {
    const s = statsByUser.get(String(r.user_id)) || {
      points_add_count: 0,
      reward_redeem_count: 0,
      points_issued: 0,
      amount_eur_sum: 0,
    };
    return {
      ...serializeMember(r),
      points_add_count: s.points_add_count,
      reward_redeem_count: s.reward_redeem_count,
      points_issued: s.points_issued,
      amount_eur_sum: s.amount_eur_sum,
    };
  });
  res.json({ members });
});

/** POST /dashboard/team/invites */
router.post("/invites", async (req, res) => {
  if (!ensureTeamManager(req, res)) return;
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "E-mail requis" });
  }
  const nameHint = String(req.body?.name || "").trim() || null;
  const roleRaw = String(req.body?.role || "staff").toLowerCase();
  const role = roleRaw === "manager" ? "manager" : "staff";
  const business = req.business;
  let u = getUserByEmail(email);
  if (!u) {
    try {
      u = createUserWithEmailOtp({ email, name: nameHint });
    } catch (e) {
      if (e?.code === "EMAIL_TAKEN") {
        u = getUserByEmail(email);
      } else {
        return res.status(400).json({ error: "Adresse e-mail invalide.", code: e?.code || "email_invalid" });
      }
    }
  }
  if (String(u.id) === String(business.user_id)) {
    return res.status(400).json({ error: "Le propriétaire du commerce a déjà tous les accès." });
  }
  const ex = db
    .prepare("SELECT 1 FROM business_team_members WHERE business_id = ? AND user_id = ?")
    .get(business.id, u.id);
  if (ex) {
    return res.status(409).json({ error: "Cet utilisateur a déjà accès à ce commerce." });
  }
  addTeamMember({
    businessId: business.id,
    userId: u.id,
    role,
    invitedBy: req.user.id,
  });
  if (nameHint && !String(u.name || "").trim()) {
    try {
      db.prepare("UPDATE users SET name = ? WHERE id = ?").run(nameHint, u.id);
    } catch (_) {}
  }

  const shopName = String(
    business.name || business.organization_name || business.slug || "Votre commerce",
  ).trim();
  const inviterLabel = String(req.user.name || "").trim() || req.user.email || "Le responsable";
  const { sent: emailSent } = await sendTeamAccessEmail({
    to: email,
    shopName,
    inviterLabel,
    role,
  });
  if (!emailSent && isEmailConfigured()) {
    console.warn("[Team] invite: échec d'envoi e-mail (voir logs [Email] Resend/SMTP)");
  } else if (!emailSent) {
    console.warn(
      "[Team] invite: aucun e-mail (définir RESEND_API_KEY ou SMTP sur le serveur — voir docs/EMAIL-TRANSACTIONNEL.md)",
    );
  }

  return res.json({
    ok: true,
    message: "Accès employé activé. L'utilisateur recevra un e-mail pour se connecter avec un code.",
    email_sent: emailSent,
  });
});

/** DELETE /dashboard/team/members/:id — id = membership_id ou user_id (employé) */
router.delete("/members/:id", (req, res) => {
  if (!ensureTeamManager(req, res)) return;
  const business = req.business;
  const raw = String(req.params.id || "").trim();
  if (!raw) {
    return res.status(400).json({ error: "Identifiant requis" });
  }
  if (String(raw) === String(business.user_id)) {
    return res.status(400).json({ error: "Impossible de retirer l'accès du propriétaire." });
  }
  const row = findActiveTeamMembership(business.id, raw);
  if (!row) {
    return res.status(404).json({ error: "Lien d'équipe introuvable" });
  }
  const targetUserId = String(row.user_id || "").trim();
  db.prepare("DELETE FROM business_team_members WHERE id = ?").run(row.id);
  if (targetUserId) {
    const targetUser = getUserById(targetUserId);
    if (
      targetUser &&
      targetUser.staff_login &&
      isReservedStaffEmailOnly(targetUser.email) &&
      isOnlyTeamUser(targetUserId)
    ) {
      try {
        deleteUserAccount(targetUserId);
      } catch (e) {
        console.error("[team] delete orphan staff account:", e);
      }
    }
  }
  return res.status(204).send();
});

export default router;
