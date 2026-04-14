/**
 * Exécution des campagnes Wallet automatiques (réglages `campaign_automation_json`).
 * Appelé par le planificateur interne dans `index.js` (~2 min après démarrage, puis toutes les 24 h).
 */
import { getDb } from "../db/connection.js";
import {
  getMemberIdsBySegment,
  filterMemberIdsExcludingRecentNotifications,
  filterMemberIdsExcludingTriggerThisCalendarYear,
} from "../db.js";
import { deliverDashboardBroadcast, CAMPAIGN_SEGMENT_KEYS } from "../routes/businesses/notifications.js";
import { normalizeEventTypeToken } from "../services/campaign-automation-ai.js";

const db = getDb();

const RULE_TO_SEGMENT = {
  welcome_pass: "welcomeNew",
  inactive_14: "inactive14",
  reward_ready: "points50",
  points_near: "pointsNear50",
  new_week: "new7",
  birthday_today: "birthdayToday",
};

const DEFAULT_MESSAGES = {
  welcome_pass: "Bienvenue ! Profitez d’une offre de bienvenue sur votre prochaine visite.",
  inactive_14:
    "Ça fait un moment... Revenez nous voir aujourd'hui et profitez de -10 %.",
  reward_ready: "Votre récompense est prête — passez en magasin pour en profiter.",
  points_near: "Plus que quelques points pour débloquer votre récompense !",
  new_week: "Merci de nous avoir rejoints récemment — profitez de nos avantages fidélité.",
  birthday_today: "Joyeux anniversaire ! Profitez de -20 % en commandant aujourd'hui.",
};

function defaultAutomationConfig() {
  const rules = {};
  for (const id of Object.keys(RULE_TO_SEGMENT)) {
    rules[id] = { enabled: false, message: DEFAULT_MESSAGES[id] || "" };
  }
  return { version: 1, global_cooldown_days: 7, rules };
}

export function mergeCampaignAutomationJson(raw) {
  const base = defaultAutomationConfig();
  if (!raw || typeof raw !== "string" || !raw.trim()) return base;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return base;
    const merged = { ...base, ...parsed };
    merged.rules = { ...base.rules, ...(parsed.rules || {}) };
    for (const id of Object.keys(RULE_TO_SEGMENT)) {
      if (!merged.rules[id]) merged.rules[id] = { enabled: false, message: DEFAULT_MESSAGES[id] || "" };
      else {
        merged.rules[id] = {
          enabled: !!merged.rules[id].enabled,
          message: String((merged.rules[id].message ?? DEFAULT_MESSAGES[id]) || "").slice(0, 200),
        };
      }
    }
    /** Ancienne règle produit retirée : ne plus exécuter ni renvoyer dans les PATCH. */
    delete merged.rules.loyal_boost;
    /** Règles `custom_<uuid>` : ciblage libre (segment API) + message + titre d’affichage. */
    for (const key of Object.keys(merged.rules)) {
      if (!key.startsWith("custom_")) continue;
      const r = merged.rules[key];
      if (!r || typeof r !== "object") {
        delete merged.rules[key];
        continue;
      }
      const seg = r.segment != null ? String(r.segment).trim() : "";
      const safe = {
        enabled: !!r.enabled && CAMPAIGN_SEGMENT_KEYS.includes(seg),
        message: String((r.message ?? "") || "").slice(0, 200),
        segment: seg,
        title: r.title != null ? String(r.title).trim().slice(0, 80) : "",
      };
      merged.rules[key] = safe;
    }
    /** Règles `event_<uuid>` : déclencheurs événementiels. */
    for (const key of Object.keys(merged.rules)) {
      if (!key.startsWith("event_")) continue;
      const r = merged.rules[key];
      if (!r || typeof r !== "object") {
        delete merged.rules[key];
        continue;
      }
      const rawEvent = r.eventType ?? r.event_type;
      const eventType = normalizeEventTypeToken(rawEvent) || null;
      const delay = Math.max(1, Math.min(1440, Number(r.delayMinutes ?? r.delay_minutes) || 2));
      const message = String((r.message ?? "") || "").trim().slice(0, 200);
      const title = r.title != null ? String(r.title).trim().slice(0, 80) : "";
      if (!eventType || !message) {
        delete merged.rules[key];
        continue;
      }
      merged.rules[key] = {
        enabled: !!r.enabled,
        message,
        title,
        eventType,
        delayMinutes: delay,
      };
    }
    const cd = merged.global_cooldown_days ?? merged.globalCooldownDays;
    merged.global_cooldown_days = Math.min(90, Math.max(1, Number(cd) || 7));
    delete merged.globalCooldownDays;
    return merged;
  } catch {
    return base;
  }
}

/**
 * @returns {{ businesses: number, rulesRun: number, sentTotal: number, errors: string[] }}
 */
export async function runCampaignAutomationCron() {
  const apiBase = (process.env.PUBLIC_API_URL || process.env.API_URL || "https://api.myfidpass.fr").replace(/\/$/, "");
  const rows = db.prepare("SELECT * FROM businesses").all();
  let rulesRun = 0;
  let sentTotal = 0;
  const errors = [];

  for (const row of rows) {
    const config = mergeCampaignAutomationJson(row.campaign_automation_json);
    const business = row;

    for (const [ruleId, rule] of Object.entries(config.rules || {})) {
      if (!rule?.enabled) continue;
      let segment = RULE_TO_SEGMENT[ruleId];
      if (!segment && typeof ruleId === "string" && ruleId.startsWith("custom_") && rule.segment) {
        segment = String(rule.segment).trim();
      }
      if (!segment || !CAMPAIGN_SEGMENT_KEYS.includes(segment)) continue;
      const message =
        (rule.message && String(rule.message).trim()) ||
        (RULE_TO_SEGMENT[ruleId] ? DEFAULT_MESSAGES[ruleId] : "") ||
        "";
      if (!message) continue;
      let memberIds = getMemberIdsBySegment(business.id, segment);
      const birthdayTrigger = "campaign_auto_birthday_today";
      if (ruleId === "birthday_today") {
        memberIds = filterMemberIdsExcludingTriggerThisCalendarYear(business.id, memberIds, birthdayTrigger);
      } else {
        memberIds = filterMemberIdsExcludingRecentNotifications(business.id, memberIds, config.global_cooldown_days ?? 7);
      }
      if (memberIds.length === 0) continue;
      rulesRun++;
      const triggerName = ruleId.startsWith("custom_")
        ? `campaign_auto_${ruleId}`.slice(0, 96)
        : ruleId === "birthday_today"
          ? birthdayTrigger
          : "campaign_auto";
      const ruleTitle =
        ruleId.startsWith("custom_") && rule.title && String(rule.title).trim()
          ? String(rule.title).trim().slice(0, 80)
          : null;
      try {
        const { sent } = await deliverDashboardBroadcast(
          business,
          row.slug,
          apiBase,
          memberIds,
          ruleTitle,
          message,
          "campaign_auto",
          {
            triggerName,
            sendMerchantReceipt: false,
            // Ne pas mettre à jour last_visit_at : ce n’est pas une visite magasin, sinon les segments « inactifs » se vident à tort.
            touchMemberLastVisit: false,
          }
        );
        sentTotal += sent;
      } catch (e) {
        errors.push(`${row.slug}/${ruleId}: ${e?.message || String(e)}`);
      }
    }
  }

  return { businesses: rows.length, rulesRun, sentTotal, errors };
}
