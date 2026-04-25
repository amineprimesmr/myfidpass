/**
 * Pack export comptable commerçant : mouvements, passif, jeu, tickets, engagement, livraison.
 * Valorisation 100 % automatique : libellés des paliers / tampons, paniers observés sur la période,
 * règles programme (points/€). Aucune saisie commerçant requise (indicatif — valider avec votre CAC).
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

/** Filtre période aligné sur `getTransactionsForBusiness`. */
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

/** Extrait un montant € depuis un libellé (palier, tampon, lot). */
export function extractEurFromText(text) {
  if (!text || typeof text !== "string") return null;
  const s = text.replace(/\s+/g, " ").trim();
  const patterns = [
    /* Pas de \b après € : en JS « € » n’est pas un « mot », la frontière échoue en fin de chaîne. */
    /(\d+(?:[.,]\d+)?)\s*(?:€|eur|euros?)/i,
    /\b(?:réduc|réduction|reduction)\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*(?:€|eur)/i,
    /(\d+(?:[.,]\d+)?)\s*(?:€|eur)\s*(?:de\s*)?(?:réduc|réduction|reduction)/i,
    /(?:valeur|offert)\s*(?:(?:de|d')\s*)?(\d+(?:[.,]\d+)?)\s*(?:€|eur)?/i,
    /\b(\d+(?:[.,]\d+)?)\s*€\s*(?:offert|gratuit)/i,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      const n = parseFloat(String(m[1]).replace(",", "."));
      if (Number.isFinite(n) && n > 0 && n < 100_000) return n;
    }
  }
  return null;
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

function sortedTiers(program) {
  const raw = program.points_reward_tiers;
  if (!Array.isArray(raw)) return [];
  return [...raw]
    .map((t) => ({ points: Number(t.points), label: String(t.label || "") }))
    .filter((t) => Number.isFinite(t.points) && t.points > 0)
    .sort((a, b) => a.points - b.points);
}

/** points → € si le libellé du palier contient un montant. */
function buildTierPointToEurMap(tiersSorted) {
  const map = {};
  for (const t of tiersSorted) {
    const eur = extractEurFromText(t.label);
    if (eur != null) map[String(t.points)] = eur;
  }
  return map;
}

function meanTierEurPerPoint(tierMap, tiersSorted) {
  const ratios = [];
  for (const t of tiersSorted) {
    const e = tierMap[String(t.points)];
    if (e != null && Number.isFinite(e) && t.points > 0) ratios.push(e / t.points);
  }
  if (!ratios.length) return null;
  return ratios.reduce((a, b) => a + b, 0) / ratios.length;
}

/** Médiane des (montant_panier € / points crédités) sur la période exportée — crédits avec montant uniquement. */
function medianEurPerIssuedPointFromTransactions(transactions) {
  const ratios = [];
  for (const t of transactions) {
    if (t.type !== "points_add") continue;
    const meta = typeof t.metadata === "string" ? safeJsonParse(t.metadata) : t.metadata || {};
    const visit = meta.visit === true || meta.visit === "true";
    if (visit) continue;
    const amt = meta.amount_eur != null ? Number(meta.amount_eur) : null;
    const pts = Number(t.points);
    if (amt != null && Number.isFinite(amt) && amt > 0 && pts > 0) ratios.push(amt / pts);
  }
  if (!ratios.length) return null;
  ratios.sort((a, b) => a - b);
  return ratios[Math.floor(ratios.length / 2)];
}

function nominalEurForPointsRedemption(deducted, tierMap, tiersSorted, syntheticEurPerPoint) {
  const d = Number(deducted);
  if (!Number.isFinite(d) || d <= 0) return { eur: null, basis: "sans_points" };
  const exact = tierMap[String(d)];
  if (exact != null) return { eur: exact, basis: `palier_libelle_exact_${d}_pts` };

  const withEur = tiersSorted.filter((t) => tierMap[String(t.points)] != null);
  if (withEur.length) {
    const up = withEur.find((t) => t.points >= d);
    if (up) {
      const e = tierMap[String(up.points)];
      return { eur: Math.round(e * (d / up.points) * 100) / 100, basis: `prorata_palier_${up.points}_pts` };
    }
    const maxT = withEur[withEur.length - 1];
    const em = tierMap[String(maxT.points)];
    return { eur: Math.round(em * (d / maxT.points) * 100) / 100, basis: `prorata_max_palier_${maxT.points}_pts` };
  }

  if (syntheticEurPerPoint != null && Number.isFinite(syntheticEurPerPoint)) {
    return { eur: Math.round(syntheticEurPerPoint * d * 100) / 100, basis: "synthese_eur_par_pt" };
  }
  return { eur: null, basis: "non_estimable" };
}

function deriveStampNominal(business, program, syntheticEurPerPoint) {
  const label = [program.stamp_reward_label, program.stamp_mid_reward_label].filter(Boolean).join(" | ");
  const fromLabel = extractEurFromText(label);
  if (fromLabel != null) return { eur: fromLabel, basis: "libelle_recompense_tampon" };

  const base = Number(program.baseline_avg_basket_eur);
  const rs = Number(program.required_stamps);
  if (Number.isFinite(base) && base > 0 && Number.isFinite(rs) && rs > 0) {
    const guess = Math.round(((base * rs) / 15) * 100) / 100;
    return { eur: guess, basis: "heuristique_panier_moyen_x_tampons_div_15" };
  }
  if (syntheticEurPerPoint != null && Number.isFinite(syntheticEurPerPoint) && Number.isFinite(rs) && rs > 0) {
    return { eur: Math.round(syntheticEurPerPoint * rs * 100) / 100, basis: "eur_par_pt_synthese_x_nb_tampons" };
  }
  return { eur: null, basis: "non_estimable" };
}

/**
 * Modèle de valorisation entièrement dérivé des données commerce + période.
 * @returns {object} champs alignés sur l’ancien `accounting_prefs` + métadonnées de calcul.
 */
export function deriveAutoValuationModel(business, program, transactions) {
  const tiersSorted = sortedTiers(program);
  const tierMap = buildTierPointToEurMap(tiersSorted);
  const fromTiersMean = meanTierEurPerPoint(tierMap, tiersSorted);
  const medianIssued = medianEurPerIssuedPointFromTransactions(transactions);

  const ppe = Number(program.points_per_euro);
  const fromProgramRule = Number.isFinite(ppe) && ppe > 0 ? 1 / ppe : null;

  let implied = fromTiersMean;
  if (implied == null || !Number.isFinite(implied)) implied = medianIssued;
  if (implied == null || !Number.isFinite(implied)) implied = fromProgramRule;

  const stamp = deriveStampNominal(business, program, implied);

  const tierEurs = Object.values(tierMap).filter((v) => v != null && Number.isFinite(v));
  let gameGift = tierEurs.length ? Math.min(...tierEurs) : null;
  if (gameGift == null && implied != null && tiersSorted.length) {
    const minPts = tiersSorted[0].points;
    gameGift = Math.round(implied * minPts * 100) / 100;
  }
  if (gameGift == null && stamp.eur != null) gameGift = stamp.eur;

  let valuation_method = "synthese_programme";
  if (Object.keys(tierMap).length) valuation_method = "libelles_paliers";
  if (medianIssued != null && fromTiersMean != null && Math.abs(fromTiersMean - medianIssued) / (medianIssued + 1e-9) > 0.35) {
    valuation_method = "mixte_paliers_et_paniers";
  }

  const derivation_steps = [];
  if (Object.keys(tierMap).length) derivation_steps.push(`€ extraits des libellés de paliers : ${JSON.stringify(tierMap)}`);
  if (fromTiersMean != null) derivation_steps.push(`Moyenne €/pt (paliers annotés) : ${fromTiersMean.toFixed(4)}`);
  if (medianIssued != null) derivation_steps.push(`Médiane €/pt (crédits panier sur la période exportée) : ${medianIssued.toFixed(4)}`);
  if (fromProgramRule != null) derivation_steps.push(`Plancher indicatif 1/(points_per_euro) : ${fromProgramRule.toFixed(4)} €/pt`);
  derivation_steps.push(`Tampon : ${stamp.basis}${stamp.eur != null ? ` → ${stamp.eur} €` : ""}`);
  derivation_steps.push(`€/pt retenu pour passif & missions : ${implied != null ? implied.toFixed(4) : "—"}`);

  return {
    valuation_method,
    tier_nominal_discount_eur_by_points: tierMap,
    stamp_reward_nominal_eur: stamp.eur,
    stamp_nominal_basis: stamp.basis,
    game_gift_nominal_eur: gameGift,
    implied_eur_per_point_outstanding: implied,
    eur_per_point_issued_median_observed: medianIssued,
    eur_per_point_mean_from_tier_labels: fromTiersMean,
    eur_per_point_from_points_per_euro_rule: fromProgramRule,
    engagement_point_nominal_eur: implied,
    derivation_steps,
    source: "auto",
  };
}

function isStampsProgram(program) {
  return String(program.program_type || "").toLowerCase() === "stamps";
}

function nominalForTransaction(row, meta, model, program) {
  const ty = row.type;
  const tiersSorted = sortedTiers(program);
  const tierMap = model.tier_nominal_discount_eur_by_points || {};
  const synth = model.implied_eur_per_point_outstanding;

  if (ty === "reward_redeem") {
    if (meta.subtype === "stamps") {
      if (model.stamp_reward_nominal_eur != null && Number.isFinite(model.stamp_reward_nominal_eur)) {
        return { eur: model.stamp_reward_nominal_eur, basis: model.stamp_nominal_basis || "tampon" };
      }
      return { eur: null, basis: "tampon_non_estime" };
    }
    if (meta.subtype === "points") {
      const pts = meta.points_deducted != null ? Number(meta.points_deducted) : Math.abs(Number(row.points) || 0);
      const { eur, basis } = nominalEurForPointsRedemption(pts, tierMap, tiersSorted, synth);
      return { eur, basis };
    }
    return { eur: null, basis: "recompense_autre" };
  }
  if (ty === "points_add" && meta.source === "game_spin") {
    if (model.game_gift_nominal_eur != null && Number.isFinite(model.game_gift_nominal_eur)) {
      return { eur: model.game_gift_nominal_eur, basis: "lot_roue_gift_ou_palier" };
    }
    const fromMeta = extractEurFromText(String(meta.reward_label || meta.label || ""));
    if (fromMeta != null) return { eur: fromMeta, basis: "metadata_spin_label" };
    return { eur: null, basis: "spin_sans_montant" };
  }
  return { eur: null, basis: "—" };
}

function readmeFr({ business, program, period, model }) {
  const lines = [
    "MYFIDPASS — LISEZ-MOI (PACK COMPTABLE)",
    "",
    `Commerce : ${business.organization_name || business.slug} (${business.slug})`,
    `Période export : ${period}`,
    `Généré le : ${new Date().toISOString()}`,
    "",
    "1) Ce dossier est généré automatiquement à partir de vos règles carte, des libellés de paliers / tampons,",
    "   des montants de panier enregistrés lors des crédits points, et des opérations sur la période choisie.",
    "2) Aucune saisie manuelle n’est requise dans l’app : les colonnes « nominal_eur_estime » et « passif_estime_eur »",
    "   sont des indications pour faciliter le travail de votre expert-comptable (à valider côté CAC).",
    `3) Mode de valorisation détecté : ${model.valuation_method}`,
    "",
    "4) Journal de calcul (résumé) :",
    ...model.derivation_steps.map((s) => `   - ${s}`),
    "",
    "5) Programme fidélité :",
    `   - Type : ${program.program_type || "—"} ; mode tickets : ${program.loyalty_mode}`,
    `   - Points/€ : ${program.points_per_euro ?? "—"} ; points/passage : ${program.points_per_visit ?? "—"}`,
    `   - Tampons requis / récompense : ${program.required_stamps ?? "—"}`,
    "",
    "6) MyFidpass ne substitue pas un expert-comptable.",
  ];
  return lines.join("\n");
}

export function buildMerchantAccountingPack({ business, days, fromDate, toDate, limit }) {
  const exportLimit = Math.min(Math.max(Number(limit) || 25000, 1), 25000);
  const fromOk = typeof fromDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(String(fromDate).trim());
  const toOk = typeof toDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(String(toDate).trim());
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
  const model = deriveAutoValuationModel(business, program, transactions);
  const baseRows = buildExportRows(transactions);
  const stamps = isStampsProgram(program);

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
    const { eur, basis } = nominalForTransaction(t, meta, model, program);
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
  const implied = model.implied_eur_per_point_outstanding;
  const stampE = model.stamp_reward_nominal_eur;
  const rs = Number(program.required_stamps);

  for (const m of members) {
    const bal = Number(m.points) || 0;
    let pe = null;
    let meth = "";
    if (stamps && stampE != null && Number.isFinite(stampE) && rs > 0 && bal > 0) {
      pe = (bal / rs) * stampE;
      meth = "tampons_solde_div_requis_x_nominal_carte";
      passifSum += pe;
    } else if (!stamps && implied != null && Number.isFinite(implied) && bal > 0) {
      pe = bal * implied;
      meth = "points_solde_x_eur_par_pt_auto";
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

  const engHeader = [
    "id",
    "member_id",
    "email",
    "name",
    "action_type",
    "points_granted",
    "status",
    "created_at",
    "reviewed_at",
    "nominal_eur_estime",
    "base_valorisation",
  ];
  const engLines = [engHeader];
  const engEur = model.engagement_point_nominal_eur;
  for (const r of engRows) {
    const ptsGranted = Number(r.points_granted) || 0;
    let ne = null;
    let basis = "";
    if (engEur != null && Number.isFinite(engEur) && ptsGranted > 0 && r.status === "approved") {
      ne = ptsGranted * engEur;
      basis = "points_mission_x_eur_par_pt_auto";
    }
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
      basis,
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
  const grHeader = [
    "grant_id",
    "member_id",
    "email",
    "status",
    "granted_at",
    "claimed_at",
    "reward_code",
    "reward_label",
    "reward_kind",
    "reward_stock_config",
    "nominal_eur_estime",
    "base_valorisation",
  ];
  const grLines = [grHeader];
  for (const r of grantRows) {
    let ne = null;
    let basis = "";
    if (r.kind === "gift") {
      const fromLot = extractEurFromText(r.label);
      if (fromLot != null) {
        ne = fromLot;
        basis = "libelle_lot";
      } else if (model.game_gift_nominal_eur != null && Number.isFinite(model.game_gift_nominal_eur)) {
        ne = model.game_gift_nominal_eur;
        basis = "derive_palier_ou_tampon";
      }
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
      basis,
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

  const rwHeader = ["reward_id", "game_code", "code", "label", "kind", "stock", "active", "weight", "nominal_eur_estime_libelle"];
  const rwLines = [rwHeader];
  for (const r of rewards) {
    const fromL = extractEurFromText(r.label);
    rwLines.push([r.id, r.game_code, r.code, r.label, r.kind, r.stock != null ? r.stock : "", r.active, r.weight, fromL != null ? String(fromL) : ""]);
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

  const progLines = [
    ["cle", "valeur_json"],
    ["program_snapshot", JSON.stringify(program)],
    ["valorisation_automatique", JSON.stringify(model)],
    ["nombre_membres", String(members.length)],
    ["transactions_exportees", String(baseRows.length)],
    ["transactions_total_match", String(total)],
    ["export_tronque", total > baseRows.length ? "1" : "0"],
    ["somme_passif_estime_eur", String(Math.round(passifSum * 10000) / 10000)],
  ];

  const summary = {
    ...summarizeExportRows(baseRows),
    members_count: members.length,
    engagement_rows: engRows.length,
    ticket_ledger_rows: ticketRows.length,
    reward_grant_rows: grantRows.length,
    game_reward_definitions: rewards.length,
    delivery_claim_rows: rdcRows.length,
    passif_estime_sum_eur: Math.round(passifSum * 10000) / 10000,
    valuation_mode: model.valuation_method,
  };

  const files = [
    { filename: "00_lisezmoi_comptable.txt", mime_type: "text/plain; charset=utf-8", content_utf8: readmeFr({ business, program, period, model }) },
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
    accounting_prefs: {
      valuation_method: model.valuation_method,
      tier_nominal_discount_eur_by_points: model.tier_nominal_discount_eur_by_points,
      stamp_reward_nominal_eur: model.stamp_reward_nominal_eur,
      engagement_point_nominal_eur: model.engagement_point_nominal_eur,
      game_gift_nominal_eur: model.game_gift_nominal_eur,
      implied_eur_per_point_outstanding: model.implied_eur_per_point_outstanding,
      note_comptable: "",
      source: "auto",
    },
    auto_accounting: model,
    summary,
    files,
  };
}
