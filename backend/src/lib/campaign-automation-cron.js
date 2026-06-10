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
import {
  getMemberIdsBirthdayToday,
  getMemberIdsPointsNear,
  getMemberIdsRewardReady,
} from "./member-campaign-segments.js";

/** Hub « bienvenue » + événements `member_created` — retirés du produit. */
export function purgeRetiredWelcomeAutomationRules(rules) {
  if (!rules || typeof rules !== "object") return;
  delete rules.welcome_pass;
  for (const key of Object.keys(rules)) {
    if (!key.startsWith("event_")) continue;
    const r = rules[key];
    if (!r || typeof r !== "object") continue;
    const raw = r.eventType ?? r.event_type;
    if (normalizeEventTypeToken(raw) === "member_created") delete rules[key];
  }
}
import { businessHasCustomNotificationIcon } from "./notification-icon-gate.js";

const db = getDb();

const RULE_TO_SEGMENT = {
  inactive_14: "inactive14",
  reward_ready: "points50",
  points_near: "pointsNear50",
  birthday_today: "birthdayToday",
};

const DEFAULT_MESSAGES = {
  inactive_14:
    "Ça fait un moment... Revenez nous voir aujourd'hui et profitez de -10 %.",
  reward_ready: "Votre récompense est prête — passez en magasin pour en profiter.",
  points_near: "Plus que quelques points pour débloquer votre récompense !",
  birthday_today: "Joyeux anniversaire ! Profitez de -20 % en commandant aujourd'hui.",
  locationEntry:
    "Vous êtes à proximité de notre commerce. Passez nous voir, votre carte Wallet est prête.",
};

/** Règles du carrousel « Notifications automatiques » (hub app + périmètre Wallet). */
const HUB_AUTOMATION_RULE_IDS = [
  "locationEntry",
  "points_near",
  "reward_ready",
  "inactive_14",
  "birthday_today",
];

function defaultHubRuleRow(id) {
  /** Relance inactifs : désactivée par défaut (évite envois aux nouveaux inscrits). */
  const enabled = id !== "inactive_14";
  return { enabled, message: DEFAULT_MESSAGES[id] || "" };
}

function defaultAutomationConfig() {
  const rules = {};
  for (const id of HUB_AUTOMATION_RULE_IDS) {
    rules[id] = defaultHubRuleRow(id);
  }
  return { version: 1, global_cooldown_days: 7, rules };
}

/** Ancien état usine (toutes désactivées + textes par défaut) → activer le hub pour les commerces existants. */
function upgradeFactoryDisabledHubRules(rules) {
  if (!rules || typeof rules !== "object") return rules;
  const allHubDisabled = HUB_AUTOMATION_RULE_IDS.every((id) => !rules[id]?.enabled);
  if (!allHubDisabled) return rules;
  const onlyDefaultMessages = HUB_AUTOMATION_RULE_IDS.every((id) => {
    const msg = String(rules[id]?.message ?? "").trim();
    const def = String(DEFAULT_MESSAGES[id] ?? "").trim();
    return !msg || msg === def;
  });
  if (!onlyDefaultMessages) return rules;
  const out = { ...rules };
  for (const id of HUB_AUTOMATION_RULE_IDS) {
    out[id] = {
      enabled: id !== "inactive_14",
      message: String((out[id]?.message ?? DEFAULT_MESSAGES[id]) || "").slice(0, 200),
    };
  }
  return out;
}

export function mergeCampaignAutomationJson(raw) {
  const base = defaultAutomationConfig();
  if (!raw || typeof raw !== "string" || !raw.trim()) return base;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return base;
    const merged = { ...base, ...parsed };
    merged.rules = { ...base.rules, ...(parsed.rules || {}) };
    for (const id of HUB_AUTOMATION_RULE_IDS) {
      if (!merged.rules[id]) merged.rules[id] = defaultHubRuleRow(id);
      else {
        merged.rules[id] = {
          enabled: !!merged.rules[id].enabled,
          message: String((merged.rules[id].message ?? DEFAULT_MESSAGES[id]) || "").slice(0, 200),
        };
      }
    }
    merged.rules = upgradeFactoryDisabledHubRules(merged.rules);
    /** Ancienne règle produit retirée : ne plus exécuter ni renvoyer dans les PATCH. */
    delete merged.rules.loyal_boost;
    /** « Nouveaux 7 j » retiré du produit : ne plus exécuter. */
    delete merged.rules.new_week;
    purgeRetiredWelcomeAutomationRules(merged.rules);
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

/** Ne conserve que `locationEntry` (périmètre Wallet) — retire toutes les automatisations serveur. */
export function stripToPerimeterOnlyAutomationConfig(config) {
  const merged =
    config && typeof config === "object"
      ? { ...config, rules: { ...(config.rules || {}) } }
      : mergeCampaignAutomationJson("");
  const loc = merged.rules?.locationEntry;
  merged.rules =
    loc && typeof loc === "object"
      ? {
          locationEntry: {
            enabled: !!loc.enabled,
            message: String(loc.message ?? "").trim().slice(0, 200),
          },
        }
      : {};
  return merged;
}

/**
 * @returns {{ businesses: number, rulesRun: number, sentTotal: number, errors: string[] }}
 */
export async function runCampaignAutomationCron() {
  /** Automatisations campagnes désactivées — produit : envoi manuel + périmètre Wallet uniquement. */
  return { businesses: 0, rulesRun: 0, sentTotal: 0, errors: [], disabled: true };
  const apiBase = (process.env.PUBLIC_API_URL || process.env.API_URL || "https://api.myfidpass.fr").replace(/\/$/, "");
  const rows = db.prepare("SELECT * FROM businesses").all();
  let rulesRun = 0;
  let sentTotal = 0;
  const errors = [];

  for (const row of rows) {
    if (!businessHasCustomNotificationIcon(row)) continue;
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
      let memberIds;
      if (ruleId === "reward_ready") {
        memberIds = getMemberIdsRewardReady(business.id, business);
      } else if (ruleId === "points_near") {
        memberIds = getMemberIdsPointsNear(business.id, business);
      } else if (ruleId === "birthday_today") {
        memberIds = getMemberIdsBirthdayToday(business.id);
      } else {
        memberIds = getMemberIdsBySegment(business.id, segment);
      }
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
