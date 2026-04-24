/**
 * Équipe commerçant : GET /team, POST /team/invites, DELETE /team/members/:id
 */
import { Router } from "express";
import { getUserByEmail, listTeamMembersForBusinessIncludingOwner, addTeamMember, findActiveTeamMembership } from "../../db/business-team.js";
import { isUserAdmin } from "../../db/users.js";
import { getDb } from "../../db/connection.js";
import { sendMail, isEmailConfigured } from "../../email.js";

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
    email: r.email ?? null,
    name: r.name ?? null,
    role: r.role ?? null,
    status: r.status ?? null,
    created_at: r.created_at ?? null,
  };
}

/** GET /dashboard/team */
router.get("/", (req, res) => {
  if (!ensureTeamManager(req, res)) return;
  const rows = listTeamMembersForBusinessIncludingOwner(req.business);
  res.json({ members: rows.map(serializeMember) });
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
  const u = getUserByEmail(email);
  if (!u) {
    return res.status(400).json({
      error:
        "Aucun compte avec cette adresse. L’invité doit d’abord s’inscrire sur l’app MyFidpass avec le même e-mail, puis l’invitation pourra être renvoyée.",
      code: "user_not_found",
    });
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
  const roleLabel = role === "manager" ? "gérant" : "employé";
  const { sent: emailSent } = await sendMail({
    to: email,
    subject: `Accès équipe — ${shopName} (MyFidpass)`,
    text: `Bonjour,\n\n${inviterLabel} vous a donné l’accès ${roleLabel} pour le commerce « ${shopName} » sur MyFidpass.\n\nOuvrez l’app et connectez-vous avec cet e-mail : le commerce apparaîtra dans votre espace (reconnexion ou rechargement du compte si besoin).\n\n— MyFidpass`,
    html: `<p>Bonjour,</p><p><strong>${inviterLabel}</strong> vous a donné l’accès <strong>${roleLabel}</strong> pour le commerce « <strong>${shopName}</strong> » sur MyFidpass.</p><p>Ouvrez l’app et connectez-vous avec cet e-mail : le commerce apparaîtra dans votre espace (reconnexion ou rechargement du compte si besoin).</p><p>— MyFidpass</p>`,
  });
  if (!emailSent && isEmailConfigured()) {
    console.warn("[Team] invite: échec d’envoi e-mail (voir logs [Email] Resend/SMTP)");
  } else if (!emailSent) {
    console.warn(
      "[Team] invite: aucun e-mail (définir RESEND_API_KEY ou SMTP sur le serveur — voir docs/EMAIL-TRANSACTIONNEL.md)",
    );
  }

  return res.json({
    ok: true,
    message: "Accès employé activé. L’utilisateur verra le commerce après la prochaine connexion (ou rechargement du compte).",
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
    return res.status(400).json({ error: "Impossible de retirer l’accès du propriétaire." });
  }
  const row = findActiveTeamMembership(business.id, raw);
  if (!row) {
    return res.status(404).json({ error: "Lien d’équipe introuvable" });
  }
  db.prepare("DELETE FROM business_team_members WHERE id = ?").run(row.id);
  return res.status(204).send();
});

export default router;
