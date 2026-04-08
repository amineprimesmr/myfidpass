/**
 * File persistante pour la génération flyer IA (OpenAI).
 * POST /dashboard/flyer/ai-generate renvoie 202 + job_id ; le traitement continue après la réponse HTTP
 * (quit app, changement d’onglet, redémarrage Railway — reprise via worker).
 */
import { randomUUID } from "crypto";
import { getDb } from "../db/connection.js";
import { getBusinessById, updateBusiness } from "../db/businesses.js";
import {
  FLYER_AI_FREE_PER_MONTH,
  currentMonthKeyUTC,
  isFlyerAiUnlimited,
} from "../services/flyer-ai-quota.js";
import {
  parseFlyerAIBody,
  buildFlyerImagePromptBackgroundOnly,
  multimodalForFlyerBackgroundOnly,
  buildFidelityClientPageBackgroundPrompt,
  multimodalForFidelityPageBackground,
  openaiGenerateFlyerImage,
  resolveFlyerColorPlan,
} from "../services/flyer-ai-image.js";
import { mergeFlyerPrefsWheelColorsFromGeneration } from "../lib/flyer-prefs.js";
import logger from "../lib/logger.js";

const db = getDb();

const MAX_ATTEMPTS = 3;
const ORPHAN_THRESHOLD_MS = 15 * 60 * 1000;
const WORKER_POLL_MS = 30_000;
const JOB_RETENTION_DAYS = 7;

db.exec(`
  CREATE TABLE IF NOT EXISTS flyer_generation_jobs (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL,
    body_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    dev_bypass_quota INTEGER NOT NULL DEFAULT 0,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    result_json TEXT,
    error_text TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_flyer_jobs_business_status
    ON flyer_generation_jobs(business_id, status);
  CREATE INDEX IF NOT EXISTS idx_flyer_jobs_status_created
    ON flyer_generation_jobs(status, created_at);
`);

/** Remet le compteur flyer IA au mois UTC courant si besoin (aligné dashboard.js). */
function syncFlyerAiBillingMonth(business) {
  const month = currentMonthKeyUTC();
  if (String(business.flyer_ai_billing_month || "").trim() !== month) {
    updateBusiness(business.id, {
      flyer_ai_billing_month: month,
      flyer_ai_generations_used: 0,
    });
    return getBusinessById(business.id);
  }
  return business;
}

/**
 * @param {string} businessId
 * @returns {number}
 */
export function countActiveFlyerJobsForBusiness(businessId) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM flyer_generation_jobs
       WHERE business_id = ? AND status IN ('queued', 'running')`,
    )
    .get(businessId);
  return Number(row?.n || 0);
}

/**
 * @param {{ businessId: string; body: Record<string, unknown>; devFlyerQuotaBypass: boolean }} p
 * @returns {string} job id
 */
export function createFlyerGenerationJob(p) {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO flyer_generation_jobs
      (id, business_id, body_json, status, dev_bypass_quota, created_at)
     VALUES (?, ?, ?, 'queued', ?, ?)`,
  ).run(id, p.businessId, JSON.stringify(p.body ?? {}), p.devFlyerQuotaBypass ? 1 : 0, now);
  logger.debug({ jobId: id, businessId: p.businessId }, "[flyer-gen-job] job créé");
  return id;
}

/**
 * @param {string} jobId
 * @param {string} businessId
 */
export function getFlyerJobForBusiness(jobId, businessId) {
  return db
    .prepare(`SELECT * FROM flyer_generation_jobs WHERE id = ? AND business_id = ?`)
    .get(jobId, businessId);
}

function markJobFailed(jobId, errorText) {
  db.prepare(
    `UPDATE flyer_generation_jobs SET status = 'failed', completed_at = ?, error_text = ? WHERE id = ?`,
  ).run(new Date().toISOString(), String(errorText ?? "unknown"), jobId);
}

/**
 * @param {string} jobId
 * @param {Record<string, unknown>} resultObj
 */
function markJobDone(jobId, resultObj) {
  db.prepare(
    `UPDATE flyer_generation_jobs SET status = 'done', completed_at = ?, result_json = ? WHERE id = ?`,
  ).run(new Date().toISOString(), JSON.stringify(resultObj), jobId);
}

function jobRowToStatusPayload(job) {
  const base = { job_id: job.id, status: job.status };
  if (job.status === "done" && job.result_json) {
    try {
      const o = JSON.parse(job.result_json);
      return { ...base, ...o };
    } catch {
      return { ...base, error: "Résultat corrompu." };
    }
  }
  if (job.status === "failed") {
    return { ...base, error: job.error_text || "Échec de la génération." };
  }
  return base;
}

/**
 * @param {string} jobId
 * @param {string} businessId
 */
export function getFlyerJobStatusForResponse(jobId, businessId) {
  const job = getFlyerJobForBusiness(jobId, businessId);
  if (!job) return null;
  return jobRowToStatusPayload(job);
}

/**
 * @param {string} jobId
 */
export async function processFlyerGenerationJob(jobId) {
  const row = db.prepare(`SELECT * FROM flyer_generation_jobs WHERE id = ?`).get(jobId);
  if (!row || row.status !== "queued") return;

  const started = new Date().toISOString();
  const upd = db
    .prepare(
      `UPDATE flyer_generation_jobs SET status = 'running', started_at = ? WHERE id = ? AND status = 'queued'`,
    )
    .run(started, jobId);
  if (upd.changes !== 1) return;

  const devBypass = row.dev_bypass_quota === 1;

  /** @type {Record<string, unknown>} */
  let bodyParsed;
  try {
    bodyParsed = JSON.parse(row.body_json || "{}");
  } catch {
    markJobFailed(jobId, "Corps de requête invalide.");
    return;
  }

  const parsed = parseFlyerAIBody(bodyParsed);
  if (!parsed.ok) {
    markJobFailed(jobId, parsed.error);
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || String(apiKey).trim().length < 20) {
    markJobFailed(jobId, "Génération IA non configurée. Ajoutez OPENAI_API_KEY sur le serveur.");
    return;
  }

  let business = syncFlyerAiBillingMonth(getBusinessById(row.business_id));
  if (!business) {
    markJobFailed(jobId, "Commerce introuvable.");
    return;
  }

  const unlimited = isFlyerAiUnlimited(business);
  const used = Math.max(0, Math.floor(Number(business.flyer_ai_generations_used) || 0));
  const bonus = Math.max(0, Math.floor(Number(business.flyer_ai_generations_bonus) || 0));
  const allowance = FLYER_AI_FREE_PER_MONTH + bonus;

  if (!unlimited && !devBypass && used >= allowance) {
    markJobFailed(
      jobId,
      "Quota de générations flyer IA atteint pour ce commerce ce mois-ci (incluant vos créations gratuites et vos packs).",
    );
    return;
  }

  try {
    const mmFlyer = multimodalForFlyerBackgroundOnly(parsed.multimodal);
    const prompt = buildFlyerImagePromptBackgroundOnly(parsed.value, {
      styleRefCount: mmFlyer.styleRefCount,
    });
    const mmBg = multimodalForFidelityPageBackground(mmFlyer, false);
    const promptBg = buildFidelityClientPageBackgroundPrompt(parsed.value, {
      styleRefCount: mmBg.styleRefCount,
    });

    const t0 = Date.now();
    const [flyerOutcome, bgOutcome] = await Promise.allSettled([
      openaiGenerateFlyerImage(apiKey, prompt, mmFlyer),
      openaiGenerateFlyerImage(apiKey, promptBg, mmBg),
    ]);
    const elapsedMs = Date.now() - t0;
    logger.info(
      { jobId, elapsedMs, flyer: flyerOutcome.status, bg: bgOutcome.status },
      "[flyer-gen-job] openai parallel finished",
    );

    if (flyerOutcome.status === "rejected") {
      throw flyerOutcome.reason;
    }
    const { b64, revised } = flyerOutcome.value;

    const colorPlan = resolveFlyerColorPlan(parsed.value);
    const prefsMerged = mergeFlyerPrefsWheelColorsFromGeneration(
      business.flyer_prefs_json,
      colorPlan.primary,
      colorPlan.secondary,
    );
    updateBusiness(business.id, {
      flyer_prefs_json: prefsMerged,
      flyer_prefs_updated_at: new Date().toISOString(),
    });

    let fidelity_page_background_saved = false;
    /** @type {string | null} */
    let fidelity_page_background_error = null;
    if (bgOutcome.status === "fulfilled") {
      const { b64: b64Bg } = bgOutcome.value;
      updateBusiness(business.id, {
        fidelity_page_background_base64: `data:image/png;base64,${b64Bg}`,
      });
      fidelity_page_background_saved = true;
    } else {
      const r = bgOutcome.reason;
      fidelity_page_background_error =
        r && typeof r === "object" && "message" in r && r.message
          ? String(r.message)
          : "Échec génération fond page fidélité.";
    }

    if (unlimited || devBypass) {
      markJobDone(jobId, {
        image_base64: b64,
        revised_prompt: revised ?? null,
        fidelity_page_background_saved,
        fidelity_page_background_error,
        flyer_ai_unlimited: true,
        flyer_ai_generations_used: used,
        flyer_ai_generations_remaining: null,
      });
      return;
    }

    const nextUsed = used + 1;
    updateBusiness(business.id, { flyer_ai_generations_used: nextUsed });
    markJobDone(jobId, {
      image_base64: b64,
      revised_prompt: revised ?? null,
      fidelity_page_background_saved,
      fidelity_page_background_error,
      flyer_ai_unlimited: false,
      flyer_ai_generations_used: nextUsed,
      flyer_ai_generations_remaining: Math.max(0, allowance - nextUsed),
    });
  } catch (e) {
    const msg = e?.message || "Erreur lors de la génération.";
    markJobFailed(jobId, String(msg));
    logger.error({ err: e, jobId }, "[flyer-gen-job] échec");
  }
}

/**
 * @param {{ businessId: string; body: Record<string, unknown>; devFlyerQuotaBypass: boolean }} params
 * @returns {string} jobId
 */
export function enqueueFlyerGenerationJob(params) {
  const jobId = createFlyerGenerationJob(params);
  setImmediate(() => {
    processFlyerGenerationJob(jobId).catch((err) => {
      logger.error({ err, jobId }, "[flyer-gen-job] setImmediate");
    });
  });
  return jobId;
}

function cleanOldJobs() {
  const cutoff = new Date(Date.now() - JOB_RETENTION_DAYS * 24 * 3600 * 1000).toISOString();
  const r = db
    .prepare(
      `DELETE FROM flyer_generation_jobs WHERE status IN ('done', 'failed') AND created_at < ?`,
    )
    .run(cutoff);
  if (r.changes > 0) {
    logger.info({ deleted: r.changes }, "[flyer-gen-job] anciens jobs supprimés");
  }
}

function resetOrphanRunningJobs() {
  const threshold = new Date(Date.now() - ORPHAN_THRESHOLD_MS).toISOString();
  const stuck = db
    .prepare(
      `SELECT id, attempt_count FROM flyer_generation_jobs WHERE status = 'running' AND started_at < ?`,
    )
    .all(threshold);
  for (const s of stuck) {
    if (s.attempt_count >= MAX_ATTEMPTS) {
      markJobFailed(
        s.id,
        "Abandon après plusieurs tentatives (génération interrompue ou timeout serveur).",
      );
      logger.warn({ jobId: s.id }, "[flyer-gen-job] job abandonné (max tentatives)");
      continue;
    }
    db.prepare(
      `UPDATE flyer_generation_jobs
       SET status = 'queued', started_at = NULL, attempt_count = attempt_count + 1
       WHERE id = ?`,
    ).run(s.id);
    logger.info({ jobId: s.id }, "[flyer-gen-job] job running réinitialisé (orphelin)");
  }
}

let workerBusy = false;

async function workerTick() {
  if (workerBusy) return;
  workerBusy = true;
  try {
    resetOrphanRunningJobs();
    const queued = db
      .prepare(
        `SELECT id FROM flyer_generation_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 5`,
      )
      .all();
    for (const q of queued) {
      await processFlyerGenerationJob(q.id);
    }
  } catch (err) {
    logger.error({ err }, "[flyer-gen-job] worker tick");
  } finally {
    workerBusy = false;
  }
}

/**
 * À appeler une fois au démarrage (index.js), comme notification-job-queue.
 */
export function startFlyerGenerationJobWorker() {
  if (process.env.NODE_ENV === "test") return;
  try {
    cleanOldJobs();
  } catch (_) {}
  setTimeout(workerTick, 5_000);
  setInterval(workerTick, WORKER_POLL_MS);
  logger.info("[flyer-gen-job] worker démarré (1er passage dans 5s, puis toutes les 30s)");
}
