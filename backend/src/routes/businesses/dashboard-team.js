/**
 * Équipe commerçant : GET /team, GET/PATCH/DELETE /team/members/:id, POST staff-accounts, resend-access
 */
import { Router } from "express";
import {
  getUserByEmail,
  listTeamMembersForBusinessIncludingOwner,
  getLoyaltyStatsByActorForBusiness,
  statsForUser,
  getRecentActivityByActor,
  serializeActivityRow,
  addTeamMember,
  findTeamMembership,
  updateTeamMemberRole,
  updateTeamMemberUserName,
  getInviterLabel,
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
import { isEmailConfigured } from "../../email.js";
import { issueAndSendEmailOtp } from "../../lib/email-otp-send.js";
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

function serializeMember(r, statsByUser) {
  const s = statsForUser(statsByUser, r.user_id);
  let invitedByLabel = null;
  if (r.invited_by) {
    invitedByLabel = getInviterLabel(r.invited_by);
  }
  return {
    membership_id: r.membership_id ?? null,
    user_id: r.user_id ?? null,
    email: r.staff_login ? null : (r.email ?? null),
    staff_login: r.staff_login ?? null,
    name: r.name ?? null,
    role: r.role ?? null,
    status: r.status ?? null,
    created_at: r.created_at ?? null,
    invited_by_label: invitedByLabel,
    scan_count: s.scan_count,
    points_add_count: s.points_add_count,
    reward_redeem_count: s.reward_redeem_count,
    points_correction_count: s.points_correction_count,
    points_issued: s.points_issued,
    amount_eur_sum: s.amount_eur_sum,
    last_activity_at: s.last_activity_at,
    scans_7d: s.scans_7d,
    scans_30d: s.scans_30d,
  };
}

function resolveMemberRow(business, rawId) {
  const id = String(rawId || "").trim();
  if (!id) return { error: "missing_id", status: 400, message: "Identifiant requis" };
  if (String(id) === String(business.user_id)) {
    const owner = db.prepare("SELECT id, email, name, staff_login FROM users WHERE id = ?").get(business.user_id);
    if (!owner) {
      return { error: "not_found", status: 404, message: "Membre introuvable" };
    }
    return {
      kind: "owner",
      userId: String(owner.id),
      row: {
        membership_id: null,
        user_id: owner.id,
        email: owner.email,
        staff_login: owner.staff_login ?? null,
        name: owner.name,
        role: "owner",
        status: "active",
        created_at: null,
        invited_by: null,
      },
    };
  }
  const membership = findTeamMembership(business.id, id);
  if (!membership) {
    return {
      error: "team_member_not_found",
      status: 404,
      message: "Employé introuvable ou accès déjà retiré.",
    };
  }
  const user = getUserById(membership.user_id);
  return {
    kind: "member",
    membership,
    userId: String(membership.user_id),
    row: {
      membership_id: membership.id,
      user_id: membership.user_id,
      email: user?.email ?? null,
      staff_login: user?.staff_login ?? null,
      name: user?.name ?? null,
      role: membership.role,
      status: membership.status,
      created_at: membership.created_at,
      invited_by: membership.invited_by ?? null,
    },
  };
}

async function sendTeamAccessEmail({ to, shopName, inviterLabel, role }) {
  const roleLabel = role === "manager" ? "gérant" : "employé";
  const introText = `Bonjour,\n\n${inviterLabel} vous a donné l'accès ${roleLabel} pour le commerce « ${shopName} » sur MyFidpass.\n\nOuvrez l'app MyFidpass, entrez votre e-mail ${to}, puis saisissez le code ci-dessous.`;
  const introHtml = `<p>Bonjour,</p><p><strong>${inviterLabel}</strong> vous a donné l'accès <strong>${roleLabel}</strong> pour le commerce « <strong>${shopName}</strong> » sur MyFidpass.</p><p>Ouvrez l'app MyFidpass, entrez votre e-mail <strong>${to}</strong>, puis saisissez le code ci-dessous.</p>`;
  return issueAndSendEmailOtp({
    to,
    subject: `Votre code MyFidpass — ${shopName}`,
    introText,
    introHtml,
  });
}

function memberEmailForAccess(user) {
  if (!user) return null;
  const email = String(user.email || "").trim().toLowerCase();
  if (!email || isReservedStaffEmailOnly(email)) return null;
  return email;
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
  const emailResult = await sendTeamAccessEmail({
    to: emailNorm,
    shopName,
    inviterLabel,
    role: roleR,
  });
  const emailSent = emailResult.sent;
  if (!emailSent && isEmailConfigured()) {
    console.warn("[Team] staff-accounts: échec d'envoi e-mail (voir logs [Email])", emailResult.error || "");
  } else if (!emailSent) {
    console.warn("[Team] staff-accounts: aucun e-mail (définir RESEND_API_KEY ou SMTP sur le serveur)");
  }

  const baseMessage = created
    ? "Employé ajouté au commerce."
    : "Accès employé activé.";
  const message = emailSent
    ? `${baseMessage} Un e-mail avec le code de connexion a été envoyé à ${emailNorm}.`
    : `${baseMessage} L'e-mail n'a pas pu être envoyé — l'employé peut demander un code depuis l'app (Se connecter).`;

  return res.status(created ? 201 : 200).json({
    ok: true,
    user_id: user.id,
    email: emailNorm,
    email_sent: emailSent,
    message,
  });
});

/** GET /dashboard/team — liste avec stats caisse par employé */
router.get("/", (req, res) => {
  if (!ensureTeamManager(req, res)) return;
  const business = req.business;
  const rows = listTeamMembersForBusinessIncludingOwner(business);
  const statsByUser = getLoyaltyStatsByActorForBusiness(business.id);
  const members = rows.map((r) => serializeMember(r, statsByUser));
  const teamTotals = {
    scan_count: members.reduce((a, m) => a + (m.scan_count || 0), 0),
    scans_7d: members.reduce((a, m) => a + (m.scans_7d || 0), 0),
    scans_30d: members.reduce((a, m) => a + (m.scans_30d || 0), 0),
    member_count: members.filter((m) => (m.role || "") !== "owner").length,
  };
  res.json({ members, team_totals: teamTotals });
});

/** GET /dashboard/team/members/:id — fiche employé + activité récente */
router.get("/members/:id", (req, res) => {
  if (!ensureTeamManager(req, res)) return;
  const business = req.business;
  const resolved = resolveMemberRow(business, req.params.id);
  if (resolved.error) {
    return res.status(resolved.status).json({ error: resolved.message, code: resolved.error });
  }
  const statsByUser = getLoyaltyStatsByActorForBusiness(business.id);
  const member = serializeMember(resolved.row, statsByUser);
  const activity = getRecentActivityByActor(business.id, resolved.userId, 30).map(serializeActivityRow);
  return res.json({ member, recent_activity: activity });
});

/** PATCH /dashboard/team/members/:id — rôle et/ou nom */
router.patch("/members/:id", validate(schemas.teamMemberPatch), (req, res) => {
  if (!ensureTeamManager(req, res)) return;
  const business = req.business;
  const resolved = resolveMemberRow(business, req.params.id);
  if (resolved.error) {
    return res.status(resolved.status).json({ error: resolved.message, code: resolved.error });
  }
  if (resolved.kind === "owner") {
    return res.status(400).json({ error: "Le propriétaire ne peut pas être modifié ici.", code: "owner_immutable" });
  }
  const membership = resolved.membership;
  let updated = false;
  if (req.body.role != null) {
    const ok = updateTeamMemberRole(membership.id, req.body.role);
    updated = updated || ok;
  }
  if (req.body.name != null) {
    const ok = updateTeamMemberUserName(resolved.userId, req.body.name);
    updated = updated || ok;
  }
  if (!updated) {
    return res.status(400).json({ error: "Aucune modification applicable.", code: "no_changes" });
  }
  const fresh = resolveMemberRow(business, membership.id);
  const statsByUser = getLoyaltyStatsByActorForBusiness(business.id);
  return res.json({
    ok: true,
    member: serializeMember(fresh.row, statsByUser),
  });
});

/** POST /dashboard/team/members/:id/resend-access — renvoyer le code OTP par e-mail */
router.post("/members/:id/resend-access", async (req, res) => {
  if (!ensureTeamManager(req, res)) return;
  const business = req.business;
  const resolved = resolveMemberRow(business, req.params.id);
  if (resolved.error) {
    return res.status(resolved.status).json({ error: resolved.message, code: resolved.error });
  }
  if (resolved.kind === "owner") {
    return res.status(400).json({ error: "Action non applicable au propriétaire.", code: "owner_immutable" });
  }
  const user = getUserById(resolved.userId);
  const email = memberEmailForAccess(user);
  if (!email) {
    return res.status(400).json({
      error: "Cet employé n'a pas d'e-mail de connexion. Créez-le avec une adresse e-mail.",
      code: "no_email_login",
    });
  }
  const shopName = String(
    business.name || business.organization_name || business.slug || "Votre commerce",
  ).trim();
  const inviterLabel = String(req.user.name || "").trim() || req.user.email || "Le responsable";
  const role = String(resolved.row.role || "staff").toLowerCase();
  const emailResult = await sendTeamAccessEmail({
    to: email,
    shopName,
    inviterLabel,
    role,
  });
  return res.json({
    ok: emailResult.sent,
    email_sent: emailResult.sent,
    message: emailResult.sent
      ? `Code de connexion renvoyé à ${email}.`
      : "L'e-mail n'a pas pu être envoyé. L'employé peut demander un code depuis l'app.",
  });
});

/** POST /dashboard/team/invites — alias historique (e-mail OTP) */
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
  const emailResult = await sendTeamAccessEmail({
    to: email,
    shopName,
    inviterLabel,
    role,
  });
  const emailSent = emailResult.sent;
  if (!emailSent && isEmailConfigured()) {
    console.warn("[Team] invite: échec d'envoi e-mail (voir logs [Email] Resend/SMTP)", emailResult.error || "");
  } else if (!emailSent) {
    console.warn(
      "[Team] invite: aucun e-mail (définir RESEND_API_KEY ou SMTP sur le serveur — voir docs/EMAIL-TRANSACTIONNEL.md)",
    );
  }

  return res.json({
    ok: true,
    message: emailSent
      ? `Accès employé activé. Un e-mail avec le code de connexion a été envoyé à ${email}.`
      : "Accès employé activé. L'e-mail n'a pas pu être envoyé — l'employé peut demander un code depuis l'app.",
    email_sent: emailSent,
  });
});

/** DELETE /dashboard/team/members/:id — id = membership_id ou user_id */
router.delete("/members/:id", (req, res) => {
  if (!ensureTeamManager(req, res)) return;
  const business = req.business;
  const raw = String(req.params.id || "").trim();
  if (!raw) {
    return res.status(400).json({ error: "Identifiant requis", code: "missing_id" });
  }
  if (String(raw) === String(business.user_id)) {
    return res.status(400).json({
      error: "Impossible de retirer l'accès du propriétaire.",
      code: "owner_immutable",
    });
  }
  const row = findTeamMembership(business.id, raw);
  if (!row) {
    return res.status(404).json({
      error: "Employé introuvable ou accès déjà retiré.",
      code: "team_member_not_found",
    });
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
