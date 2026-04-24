/**
 * Équipe commerçant : GET /team, POST /team/invites, DELETE /team/members/:id
 */
import { Router } from "express";
import { getUserByEmail, listTeamMembersForBusinessIncludingOwner, addTeamMember, findActiveTeamMembership } from "../../db/business-team.js";
import { isUserAdmin } from "../../db/users.js";
import { getDb } from "../../db/connection.js";

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
router.post("/invites", (req, res) => {
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
  return res.json({
    ok: true,
    message: "Accès employé activé. L’utilisateur verra le commerce après la prochaine connexion (ou rechargement du compte).",
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
