/**
 * Exécution quotidienne des campagnes Wallet automatiques (réglages `campaign_automation_json`).
 * Déclenché par POST /api/internal/campaign-automation/run (secret CRON_SECRET).
 */
import { getDb } from "../db/connection.js";
import { getBusinessById } from "../db/businesses.js";
import { getMemberIdsBySegment, filterMemberIdsExcludingRecentNotifications } from "../db.js";
import { deliverDashboardBroadcast, CAMPAIGN_SEGMENT_KEYS } from "../routes/businesses/notifications.js";

const db = getDb();

const RULE_TO_SEGMENT = {
  welcome_pass: "welcomeNew",
  inactive_14: "inactive14",
  inactive_30: "inactive30",
  inactive_60: "inactive60",
  reward_ready: "points50",
  points_near: "pointsNear50",
  loyal_boost: "recurrent",
  new_members: "new30",
  new_week: "new7",
};

const DEFAULT_MESSAGES = {
  welcome_pass: "Bienvenue ! Profitez d’une offre de bienvenue sur votre prochaine visite.",
  inactive_14: "Ça fait un moment… Revenez nous voir, une surprise vous attend.",
  inactive_30: "On vous a manqué ! Revenez nous voir : offre sur votre prochaine visite.",
  inactive_60: "Ça fait longtemps ! Profitez de notre offre exclusive pour revenir.",
  reward_ready: "Votre récompense est prête — passez en magasin pour en profiter.",
  points_near: "Plus que quelques points pour débloquer votre récompense !",
  loyal_boost: "Merci pour votre fidélité — une offre rien que pour vous.",
  new_members: "Merci de nous rejoindre ! Découvrez nos avantages fidélité.",
  new_week: "Vous êtes nouveau ? Voici un petit coup de pouce pour votre prochaine visite.",
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
  const rows = db.prepare("SELECT id, slug, organization_name, notification_title_override, campaign_automation_json FROM businesses").all();
  let rulesRun = 0;
  let sentTotal = 0;
  const errors = [];

  for (const row of rows) {
    const config = mergeCampaignAutomationJson(row.campaign_automation_json);
    const business = getBusinessById(row.id);
    if (!business) continue;

    for (const [ruleId, rule] of Object.entries(config.rules || {})) {
      if (!rule?.enabled) continue;
      const segment = RULE_TO_SEGMENT[ruleId];
      if (!segment || !CAMPAIGN_SEGMENT_KEYS.includes(segment)) continue;
      const message = (rule.message && String(rule.message).trim()) || DEFAULT_MESSAGES[ruleId];
      if (!message) continue;
      let memberIds = getMemberIdsBySegment(business.id, segment);
      memberIds = filterMemberIdsExcludingRecentNotifications(business.id, memberIds, config.global_cooldown_days ?? 7);
      if (memberIds.length === 0) continue;
      rulesRun++;
      try {
        const { sent } = await deliverDashboardBroadcast(
          business,
          row.slug,
          apiBase,
          memberIds,
          null,
          message,
          "campaign_auto"
        );
        sentTotal += sent;
      } catch (e) {
        errors.push(`${row.slug}/${ruleId}: ${e?.message || String(e)}`);
      }
    }
  }

  return { businesses: rows.length, rulesRun, sentTotal, errors };
}
