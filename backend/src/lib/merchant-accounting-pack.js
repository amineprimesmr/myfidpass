/**
 * Pack export comptable commerçant : mouvements, passif estimé, jeu, tickets, engagement, livraison.
 * Les montants « nominal_eur » sont indicatifs selon `accounting_prefs_json` (responsabilité du commerçant / expert-comptable).
 */
import { getDb } from "../db/connection.js";
import { getTransactionsForBusiness } from "../db/transactions.js";
import { buildExportRows, summarizeExportRows } from "./merchant-transaction-export.js";

const db = getDb();

function safeJsonParse(raw) {
  if (raw == null || raw === "") return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

function escapeCsv(v) {
  return String(v ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\n/g, " ")
    .replace(/;/g, ",");
}

function csvFromMatrix(rows) {
  if (!rows.length) return "";
  return rows.map((line) => line.map(escapeCsv).join(";")).join("\n");
}

/** Filtre période aligné sur `getTransactionsForBusiness` (dates inclusives, sinon glissant jours whitelist). */
function periodSqlOn(columnDateExpr, fromDate, toDate, days) {
  const fromOk = typeof fromDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(String(fromDate).trim());
  const toOk = typeof toDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(String(toDate).trim());
  let sql = "";
  const params = [];
  if (fromOk) {
    sql += ` AND date(${columnDateExpr}) >= date(?)`;
    params.push(fromDate.trim());
  }
  if (toOk) {
    sql += ` AND date(${columnDateExpr}) <= date(?)`;
    params.push(toDate.trim());
  }
  const d = Number(days);
  if (!fromOk && !toOk && [7, 30, 90, 365].includes(d)) {
    sql += ` AND ${columnDateExpr} >= datetime('now', '-${d} days')`;
  }
  return { sql, params };
}

function parseAccountingPrefs(business) {
  const o = safeJsonParse(business.accounting_prefs_json);
  const method = String(o.valuation_method || o.valuationMethod || "non_renseigne").toLowerCase();
  const allowed = new Set(["discount", "stock", "hybrid", "non_renseigne"]);
  return {
    valuation_method: allowed.has(method) ? method : "non_renseigne",
    stamp_reward_nominal_eur: o.stamp_reward_nominal_eur != null ? Number(o.stamp_reward_nominal_eur) : null,
    engagement_point_nominal_eur: o.engagement_point_nominal_eur != null ? Number(o.engagement_point_nominal_eur) : null,
    game_gift_nominal_eur: o.game_gift_nominal_eur != null ? Number(o.game_gift_nominal_eur) : null,
    implied_eur_per_point_outstanding:
      o.implied_eur_per_point_outstanding != null ? Number(o.implied_eur_per_point_outstanding) : null,
    tier_nominal_discount_eur_by_points: typeof o.tier_nominal_discount_eur_by_points === "object" && o.tier_nominal_discount_eur_by_points
      ? o.tier_nominal_discount_eur_by_points
      : {},
    note_comptable: o.note_comptable != null ? String(o.note_comptable).slice(0, 4000) : "",
  };
}

function tierNominalEur(prefs, pointsNeeded) {
  const map = prefs.tier_nominal_discount_eur_by_points || {};
  const k = String(pointsNeeded);
  const v = map[k] ?? map[pointsNeeded];
  const n = v != null ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function nominalForTransaction(row, meta, prefs) {
  const ty = row.type;
  if (ty === "reward_redeem") {
    if (meta.subtype === "stamps" && prefs.stamp_reward_nominal_eur != null && Number.isFinite(prefs.stamp_reward_nominal_eur)) {
      return { eur: prefs.stamp_reward_nominal_eur, basis: "prefs.stamp_reward_nominal_eur" };
    }
    if (meta.subtype === "points") {
      const pts = meta.points_deducted != null ? Number(meta.points_deducted) : Math.abs(Number(row.points) || 0);
      const te = tierNominalEur(prefs, pts);
      if (te != null) return { eur: te, basis: `tier_map[${pts}]` };
    }
    return { eur: null, basis: "non_mappable" };
  }
  if (ty === "points_add" && meta.source === "game_spin") {
    if (prefs.game_gift_nominal_eur != null && Number.isFinite(prefs.game_gift_nominal_eur)) {
      return { eur: prefs.game_gift_nominal_eur, basis: "prefs.game_gift_nominal_eur" };
    }
  }
  return { eur: null, basis: "—" };
}

function programSnapshot(business) {
  let tiers = business.points_reward_tiers;
  if (typeof tiers === "string" && tiers.trim()) {
    try {
      tiers = JSON.parse(tiers);
    } catch {
      tiers = null;
    }
  }
  return {
    program_type: business.program_type || null,
    loyalty_mode: business.loyalty_mode || "points_cash",
    points_per_euro: business.points_per_euro != null ? Number(business.points_per_euro) : null,
    points_per_visit: business.points_per_visit != null ? Number(business.points_per_visit) : null,
    points_min_amount_eur: business.points_min_amount_eur != null ? Number(business.points_min_amount_eur) : null,
    points_reward_tiers: Array.isArray(tiers) ? tiers : null,
    required_stamps: business.required_stamps != null ? Number(business.required_stamps) : null,
    stamp_reward_label: business.stamp_reward_label || null,
    stamp_mid_reward_label: business.stamp_mid_reward_label || null,
    stamp_emoji: business.stamp_emoji || null,
    points_per_ticket: business.points_per_ticket != null ? Number(business.points_per_ticket) : null,
    expiry_months: business.expiry_months != null ? Number(business.expiry_months) : null,
    sector: business.sector || null,
    baseline_avg_basket_eur: business.baseline_avg_basket_eur != null ? Number(business.baseline_avg_basket_eur) : null,
  };
}

function periodLabel(days, fromDate, toDate) {
  if (fromDate || toDate) return `Du ${fromDate || "…"} au ${toDate || "…"} (dates sur created_at UTC SQLite)`;
  if (days) return `Glissant : ${days} derniers jours (réf. serveur UTC)`;
  return "Toutes les données dans la limite d’export";
}

function readmeFr({ business, prefs, program, period }) {
  return [
    "MYFIDPASS — LISEZ-MOI (PACK COMPTABLE)",
    "",
    `Commerce : ${business.organization_name || business.slug} (${business.slug})`,
    `Période export : ${period}`,
    `Généré le : ${new Date().toISOString()}`,
    "",
    "1) Ce dossier regroupe les mouvements fidélité bruts et des indicateurs pour votre bilan.",
    "2) Les colonnes « nominal_eur_estime » et « passif_estime_eur » ne sont renseignées que si vous avez",
    "   configuré accounting_prefs (app Réglages > Pack comptable, ou PATCH dashboard/settings).",
    `3) Méthode de valorisation déclarée : ${prefs.valuation_method} (stock / remise / hybride : à formaliser avec votre expert).`,
    "",
    "4) Programme fidélité (extrait) :",
    `   - Type : ${program.program_type || "—"} ; mode tickets : ${program.loyalty_mode}`,
    `   - Points/€ : ${program.points_per_euro ?? "—"} ; points/passage : ${program.points_per_visit ?? "—"}`,
    `   - Tampons requis / récompense : ${program.required_stamps ?? "—"}`,
    "",
    "5) Responsabilité : MyFidpass ne substitue pas un expert-comptable ; les montants nominaux sont des aides",
    "   basées sur vos hypothèses (valeur faciale remises, coût stock cadeau, etc.).",
    prefs.note_comptable ? `\nNote commerçant :\n${prefs.note_comptable}\n` : "",
  ].join("\n");
}

/**
 * @param {object} p
 * @param {import("../db/connection.js").Database} p.db unused (module singleton)
 * @param {object} p.business row businesses.*
 * @param {number|null} p.days
 * @param {string|null} p.fromDate YYYY-MM-DD
 * @param {string|null} p.toDate YYYY-MM-DD
 * @param {number} p.limit max transactions
 */
export function buildMerchantAccountingPack({ business, days, fromDate, toDate, limit }) {
  const exportLimit = Math.min(Math.max(Number(limit) || 25000, 1), 25000);
  const fromOk = typeof fromDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(String(fromDate).trim());
  const toOk = typeof toDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(String(toDate).trim());
  const prefs = parseAccountingPrefs(business);
  const program = programSnapshot(business);
  const period = periodLabel(days, fromDate, toDate);

  const { transactions, total } = getTransactionsForBusiness(business.id, {
    limit: exportLimit,
    offset: 0,
    memberId: null,
    days: [7, 30, 90, 365].includes(Number(days)) ? Number(days) : null,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    type: null,
    typesCsv: null,
  });
  const baseRows = buildExportRows(transactions);

  const grandLivreHeader = [
    "id",
    "date_utc",
    "member_id",
    "client",
    "email",
    "type_technique",
    "type_libelle",
    "detail",
    "points",
    "montant_panier_eur",
    "sous_type_recompense",
    "points_palier_ou_tampons",
    "nominal_eur_estime",
    "base_valorisation",
    "metadata_json_compact",
  ];

  const grandLivreLines = [grandLivreHeader];
  for (let i = 0; i < transactions.length; i++) {
    const t = transactions[i];
    const br = baseRows[i];
    const meta = typeof t.metadata === "string" ? safeJsonParse(t.metadata) : t.metadata || {};
    const amt = meta.amount_eur != null && Number.isFinite(Number(meta.amount_eur)) ? Number(meta.amount_eur) : "";
    const sub = meta.subtype != null ? String(meta.subtype) : "";
    const ptsPalier = meta.points_deducted != null ? meta.points_deducted : meta.required_stamps != null ? meta.required_stamps : "";
    const { eur, basis } = nominalForTransaction(t, meta, prefs);
    grandLivreLines.push([
      br.id,
      br.created_at || "",
      br.member_id,
      br.member_name,
      br.member_email,
      br.type,
      br.type_label,
      br.detail,
      br.points != null ? br.points : "",
      amt,
      sub,
      ptsPalier,
      eur != null ? String(Math.round(eur * 10000) / 10000) : "",
      basis,
      JSON.stringify(meta).slice(0, 500),
    ]);
  }

  const members = db
    .prepare(
      `SELECT m.id, m.email, m.name, m.points, m.created_at, m.last_visit_at,
              (SELECT COUNT(*) FROM transactions t WHERE t.member_id = m.id AND t.business_id = m.business_id) AS tx_count
       FROM members m WHERE m.business_id = ? ORDER BY m.email`
    )
    .all(business.id);

  const passifHeader = [
    "member_id",
    "email",
    "name",
    "solde_points_ou_tampons",
    "nb_transactions_historique",
    "created_at",
    "last_visit_at",
    "passif_estime_eur",
    "methode_passif",
  ];
  const passifLines = [passifHeader];
  let passifSum = 0;
  const implied = prefs.implied_eur_per_point_outstanding;
  for (const m of members) {
    const bal = Number(m.points) || 0;
    let pe = null;
    let meth = "";
    if (implied != null && Number.isFinite(implied) && bal > 0) {
      pe = bal * implied;
      meth = "prefs.implied_eur_per_point_outstanding * solde";
      passifSum += pe;
    }
    passifLines.push([
      m.id,
      m.email,
      m.name,
      bal,
      m.tx_count ?? "",
      m.created_at || "",
      m.last_visit_at || "",
      pe != null ? String(Math.round(pe * 10000) / 10000) : "",
      meth,
    ]);
  }

  const engPeriod = periodSqlOn("ec.created_at", fromDate, toDate, days);
  let engRows = [];
  try {
    engRows = db
      .prepare(
        `SELECT ec.id, ec.member_id, ec.action_type, ec.points_granted, ec.status, ec.created_at, ec.reviewed_at,
                m.email as member_email, m.name as member_name
         FROM engagement_completions ec JOIN members m ON ec.member_id = m.id
         WHERE ec.business_id = ?${engPeriod.sql}
         ORDER BY ec.created_at DESC LIMIT 20000`
      )
      .all(business.id, ...engPeriod.params);
  } catch {
    engRows = [];
  }

  const engHeader = ["id", "member_id", "email", "name", "action_type", "points_granted", "status", "created_at", "reviewed_at", "nominal_eur_estime"];
  const engLines = [engHeader];
  const engEur = prefs.engagement_point_nominal_eur;
  for (const r of engRows) {
    const ptsGranted = Number(r.points_granted) || 0;
    const ne =
      engEur != null && Number.isFinite(engEur) && ptsGranted > 0 && r.status === "approved"
        ? ptsGranted * engEur
        : null;
    engLines.push([
      r.id,
      r.member_id,
      r.member_email,
      r.member_name,
      r.action_type,
      r.points_granted,
      r.status,
      r.created_at,
      r.reviewed_at || "",
      ne != null ? String(Math.round(ne * 10000) / 10000) : "",
    ]);
  }

  const pt = periodSqlOn("tl.created_at", fromDate, toDate, days);
  let ticketRows = [];
  try {
    ticketRows = db
      .prepare(
        `SELECT tl.id, tl.member_id, tl.source_type, tl.delta, tl.balance_after, tl.reference_type, tl.reference_id, tl.created_at, m.email
         FROM ticket_ledger tl JOIN members m ON tl.member_id = m.id
         WHERE tl.business_id = ?${pt.sql}
         ORDER BY tl.created_at DESC LIMIT 20000`
      )
      .all(business.id, ...pt.params);
  } catch {
    ticketRows = [];
  }
  const tkHeader = ["id", "member_id", "email", "source_type", "delta", "balance_after", "reference_type", "reference_id", "created_at"];
  const tkLines = [tkHeader];
  for (const r of ticketRows) {
    tkLines.push([
      r.id,
      r.member_id,
      r.email,
      r.source_type,
      r.delta,
      r.balance_after,
      r.reference_type || "",
      r.reference_id || "",
      r.created_at,
    ]);
  }

  const grantPeriod = periodSqlOn("rg.granted_at", fromDate, toDate, days);
  let grantRows = [];
  try {
    grantRows = db
      .prepare(
        `SELECT rg.id, rg.member_id, rg.status, rg.granted_at, rg.claimed_at, gr.code, gr.label, gr.kind, gr.stock, m.email
         FROM reward_grants rg
         JOIN game_spins gs ON rg.spin_id = gs.id
         JOIN game_rewards gr ON rg.reward_id = gr.id
         JOIN members m ON rg.member_id = m.id
         WHERE rg.business_id = ?${grantPeriod.sql}
         ORDER BY rg.granted_at DESC LIMIT 20000`
      )
      .all(business.id, ...grantPeriod.params);
  } catch {
    grantRows = [];
  }
  const grHeader = ["grant_id", "member_id", "email", "status", "granted_at", "claimed_at", "reward_code", "reward_label", "reward_kind", "reward_stock_config", "nominal_eur_estime"];
  const grLines = [grHeader];
  for (const r of grantRows) {
    let ne = null;
    if (r.kind === "gift" && prefs.game_gift_nominal_eur != null && Number.isFinite(prefs.game_gift_nominal_eur)) {
      ne = prefs.game_gift_nominal_eur;
    }
    grLines.push([
      r.id,
      r.member_id,
      r.email,
      r.status,
      r.granted_at,
      r.claimed_at || "",
      r.code,
      r.label,
      r.kind,
      r.stock != null ? r.stock : "",
      ne != null ? String(ne) : "",
    ]);
  }

  const rewards = db
    .prepare(
      `SELECT gr.id, gr.code, gr.label, gr.kind, gr.stock, gr.active, gr.weight, g.code as game_code
       FROM game_rewards gr
       JOIN games g ON gr.game_id = g.id
       WHERE gr.business_id = ? ORDER BY g.code, gr.code`
    )
    .all(business.id);

  const rwHeader = ["reward_id", "game_code", "code", "label", "kind", "stock", "active", "weight"];
  const rwLines = [rwHeader];
  for (const r of rewards) {
    rwLines.push([r.id, r.game_code, r.code, r.label, r.kind, r.stock != null ? r.stock : "", r.active, r.weight]);
  }

  const rdcPeriod = periodSqlOn("rdc.created_at", fromDate, toDate, days);
  let rdcRows = [];
  try {
    rdcRows = db
      .prepare(
        `SELECT rdc.id, rdc.member_id, rdc.status, rdc.amount_eur, rdc.points_credited, rdc.created_at, rdc.resolved_at, rdc.rejection_reason
         FROM receipt_delivery_claims rdc
         WHERE rdc.business_id = ?${rdcPeriod.sql}
         ORDER BY rdc.created_at DESC LIMIT 5000`
      )
      .all(business.id, ...rdcPeriod.params);
  } catch {
    rdcRows = [];
  }
  const rdcHeader = ["id", "member_id", "status", "amount_eur", "points_credited", "created_at", "resolved_at", "rejection_reason"];
  const rdcLines = [rdcHeader];
  for (const r of rdcRows) {
    rdcLines.push([
      r.id,
      r.member_id,
      r.status,
      r.amount_eur,
      r.points_credited != null ? r.points_credited : "",
      r.created_at,
      r.resolved_at || "",
      (r.rejection_reason || "").replace(/;/g, " "),
    ]);
  }

  const progHeader = ["cle", "valeur_json"];
  const progLines = [
    progHeader,
    ["program_snapshot", JSON.stringify(program)],
    ["accounting_prefs_effectifs", JSON.stringify(prefs)],
    ["nombre_membres", String(members.length)],
    ["transactions_exportees", String(baseRows.length)],
    ["transactions_total_match", String(total)],
    ["export_tronque", total > baseRows.length ? "1" : "0"],
    ["somme_passif_points_implied_eur", String(Math.round(passifSum * 10000) / 10000)],
  ];

  const summary = {
    ...summarizeExportRows(baseRows),
    members_count: members.length,
    engagement_rows: engRows.length,
    ticket_ledger_rows: ticketRows.length,
    reward_grant_rows: grantRows.length,
    game_reward_definitions: rewards.length,
    delivery_claim_rows: rdcRows.length,
    passif_estime_sum_eur_implied_points: Math.round(passifSum * 10000) / 10000,
  };

  const files = [
    { filename: "00_lisezmoi_comptable.txt", mime_type: "text/plain; charset=utf-8", content_utf8: readmeFr({ business, prefs, program, period }) },
    { filename: "01_cadre_programme_et_hypotheses.csv", mime_type: "text/csv; charset=utf-8", content_utf8: "\uFEFF" + csvFromMatrix(progLines) },
    { filename: "02_grand_livre_fidelite.csv", mime_type: "text/csv; charset=utf-8", content_utf8: "\uFEFF" + csvFromMatrix(grandLivreLines) },
    { filename: "03_passif_membres_solde_courant.csv", mime_type: "text/csv; charset=utf-8", content_utf8: "\uFEFF" + csvFromMatrix(passifLines) },
    { filename: "04_engagements_avis_reseaux.csv", mime_type: "text/csv; charset=utf-8", content_utf8: "\uFEFF" + csvFromMatrix(engLines) },
    { filename: "05_tickets_ledger.csv", mime_type: "text/csv; charset=utf-8", content_utf8: "\uFEFF" + csvFromMatrix(tkLines) },
    { filename: "06_roue_recompenses_octroyees.csv", mime_type: "text/csv; charset=utf-8", content_utf8: "\uFEFF" + csvFromMatrix(grLines) },
    { filename: "07_catalogue_lots_jeu.csv", mime_type: "text/csv; charset=utf-8", content_utf8: "\uFEFF" + csvFromMatrix(rwLines) },
    { filename: "08_livraison_reclamations_points.csv", mime_type: "text/csv; charset=utf-8", content_utf8: "\uFEFF" + csvFromMatrix(rdcLines) },
  ];

  return {
    business_slug: business.slug,
    business_name: business.organization_name || business.slug,
    generated_at: new Date().toISOString(),
    period_label: period,
    filters: {
      days: [7, 30, 90, 365].includes(Number(days)) ? Number(days) : null,
      date_from: fromOk ? fromDate.trim() : null,
      date_to: toOk ? toDate.trim() : null,
      limit: exportLimit,
    },
    program_snapshot: program,
    accounting_prefs: prefs,
    summary,
    files,
  };
}
