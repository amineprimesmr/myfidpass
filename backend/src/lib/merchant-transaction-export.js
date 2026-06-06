/**
 * Libellés et détails d’export (CSV / JSON) pour le rapport d’activité commerçant.
 */

const TYPE_LABELS_FR = {
  points_add: "Crédit points",
  reward_redeem: "Récompense utilisée",
  points_correction: "Correction caisse",
  points_redeem_game_tickets: "Échange jeu / tickets",
  welcome_bonus: "Nouveau membre",
};

function safeParseMetadata(raw) {
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

function isVisitMetadata(meta) {
  return meta.visit === true || meta.visit === "true";
}

/**
 * Libellé métier du type (ligne export).
 */
export function transactionTypeLabelFr(rowType, metadata) {
  const meta = typeof metadata === "object" ? metadata : safeParseMetadata(metadata);
  if (rowType === "points_add" && isVisitMetadata(meta)) return "Passage";
  return TYPE_LABELS_FR[rowType] || rowType || "—";
}

/**
 * Détail lisible (montant, palier, tampons, etc.).
 */
export function transactionDetailFr(rowType, metadata, points) {
  const meta = typeof metadata === "object" ? metadata : safeParseMetadata(metadata);
  const parts = [];

  if (rowType === "points_add") {
    if (meta.source === "game_spin") {
      parts.push(meta.game_code ? `Bonus jeu (${meta.game_code})` : "Bonus jeu");
    }
    if (meta.amount_eur != null && Number.isFinite(Number(meta.amount_eur))) {
      parts.push(`${Number(meta.amount_eur).toFixed(2)} €`);
    }
    if (isVisitMetadata(meta)) parts.push("passage");
    if (meta.points_capped) parts.push("plafond appliqué");
  } else if (rowType === "reward_redeem") {
    if (meta.subtype === "stamps") {
      const rs = meta.required_stamps != null ? meta.required_stamps : "";
      parts.push(`Carte tampons (${rs} tampons)`);
    } else if (meta.subtype === "points") {
      const d = meta.points_deducted ?? Math.abs(Number(points) || 0);
      parts.push(`Palier / réduction (${d} pts)`);
    } else {
      parts.push("Récompense fidélité");
    }
  } else if (rowType === "points_correction") {
    parts.push(meta.reason === "cashier_correction" ? "Retrait manuel" : "Correction");
  } else if (rowType === "points_redeem_game_tickets") {
    if (meta.tickets_added != null) parts.push(`+${meta.tickets_added} ticket(s)`);
    if (meta.points_per_ticket != null) parts.push(`${meta.points_per_ticket} pts/ticket`);
    if (meta.source === "game_tickets_convert") parts.push("conversion points → tickets");
  }

  const s = parts.filter(Boolean).join(" · ");
  return s || "—";
}

function escapeCsvCell(s) {
  const t = String(s ?? "").replace(/\r?\n/g, " ").replace(/;/g, ",");
  return t;
}

/**
 * @param {Array<{ id, member_id, member_name, member_email, type, points, metadata, created_at }>} transactions
 */
export function buildExportRows(transactions) {
  return transactions.map((t) => {
    const meta = safeParseMetadata(t.metadata);
    const typeLabel = transactionTypeLabelFr(t.type, meta);
    const detail = transactionDetailFr(t.type, meta, t.points);
    return {
      id: t.id,
      member_id: t.member_id,
      member_name: t.member_name || "",
      member_email: t.member_email || "",
      type: t.type,
      type_label: typeLabel,
      detail,
      points: t.points != null ? Number(t.points) : null,
      created_at: t.created_at || null,
    };
  });
}

export function summarizeExportRows(rows) {
  const byType = {};
  let pointsCredited = 0;
  let pointsDebited = 0;
  for (const r of rows) {
    const ty = r.type || "unknown";
    byType[ty] = (byType[ty] || 0) + 1;
    const p = Number(r.points) || 0;
    if (p > 0) pointsCredited += p;
    else if (p < 0) pointsDebited += p;
  }
  return {
    row_count: rows.length,
    by_type: byType,
    points_credited_total: pointsCredited,
    points_debited_total: pointsDebited,
  };
}

export function buildCsvFromRows(rows) {
  const header =
    "ID;ID membre;Client;Email;Type technique;Type;Detail;Points;Date\n";
  const lines = rows.map((r) => {
    const date = r.created_at ? new Date(r.created_at).toLocaleString("fr-FR") : "";
    return [
      escapeCsvCell(r.id),
      escapeCsvCell(r.member_id),
      escapeCsvCell(r.member_name),
      escapeCsvCell(r.member_email),
      escapeCsvCell(r.type),
      escapeCsvCell(r.type_label),
      escapeCsvCell(r.detail),
      r.points != null ? String(r.points) : "",
      escapeCsvCell(date),
    ].join(";");
  });
  return header + lines.join("\n");
}
