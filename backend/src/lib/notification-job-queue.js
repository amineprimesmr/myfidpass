/**
 * File de travaux persistante pour les campagnes de notifications (PassKit + Web Push).
 *
 * POURQUOI : avant ce module, `setImmediate()` lançait l'envoi hors de la requête HTTP.
 * Si Railway redémarrait le conteneur entre le 202 Accepted et l'exécution de la microtask
 * (déploiement, crash, OOM), la campagne était perdue silencieusement — sans log, sans alerte.
 * Le commerçant pensait que ça s'était envoyé.
 *
 * SOLUTION : chaque campagne crée une ligne dans `notification_jobs` AVANT de retourner 202.
 * - Chemin rapide : `setImmediate()` traite le job dans la foulée (comme avant, sans délai).
 * - Chemin de secours : un worker interne reprend les jobs `pending` ou `running` orphelins
 *   (crash pendant traitement) toutes les 30 secondes au démarrage du serveur.
 *
 * CYCLE DE VIE D'UN JOB :
 *   pending → running → done       (chemin nominal)
 *   pending → running → failed     (erreur après MAX_ATTEMPTS tentatives)
 *   running (orphelin) → running → done/failed  (repris par le worker après redémarrage)
 */
import { randomUUID } from "crypto";
import { getDb } from "../db/connection.js";
import { getBusinessById } from "../db/businesses.js";
import { deliverCustomerBroadcast } from "../notifications/dispatch.js";
import logger from "./logger.js";

const db = getDb();

// ── Constantes ──────────────────────────────────────────────────────────────

/** Nombre max de tentatives avant d'abandonner un job. */
const MAX_ATTEMPTS = 3;

/** Intervalle du worker de récupération (ms). */
const WORKER_POLL_MS = 30_000;

/** Conservation des jobs terminés (jours). */
const JOB_RETENTION_DAYS = 7;

/**
 * Un job `running` depuis plus de 5 minutes est considéré orphelin (crash du process
 * précédent). Le worker le reprend.
 */
const ORPHAN_THRESHOLD_MS = 5 * 60 * 1000;

// ── Schema (idempotent) ─────────────────────────────────────────────────────
// Créé ici en plus de migrations.js pour garantir l'existence sur toute base fraîche.
db.exec(`
  CREATE TABLE IF NOT EXISTS notification_jobs (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    api_base TEXT NOT NULL,
    member_ids TEXT,
    title TEXT,
    body TEXT NOT NULL,
    trigger_name TEXT NOT NULL DEFAULT 'campaign_manual',
    merchant_user_id TEXT,
    touch_member_last_visit INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    error TEXT,
    batch_id TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_notif_jobs_status_created
    ON notification_jobs(status, created_at);
`);

// ── Écriture ────────────────────────────────────────────────────────────────

/**
 * Crée un job de campagne en base et retourne son id.
 * Synchrone (better-sqlite3) : la persistance est garantie AVANT le 202 HTTP.
 *
 * @param {object} p
 * @param {string} p.businessId
 * @param {string} p.slug
 * @param {string} p.apiBase
 * @param {string[]|null} p.memberIds
 * @param {string|null} p.title
 * @param {string} p.body
 * @param {string} [p.triggerName]
 * @param {string|null} [p.merchantUserId]
 * @param {boolean} [p.touchMemberLastVisit]
 * @returns {string} jobId
 */
export function createNotificationJob({
  businessId,
  slug,
  apiBase,
  memberIds,
  title,
  body,
  triggerName = "campaign_manual",
  merchantUserId = null,
  touchMemberLastVisit = true,
}) {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO notification_jobs
      (id, business_id, slug, api_base, member_ids, title, body,
       trigger_name, merchant_user_id, touch_member_last_visit, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    id,
    businessId,
    slug,
    apiBase,
    memberIds != null ? JSON.stringify(memberIds) : null,
    title ?? null,
    body,
    triggerName,
    merchantUserId ?? null,
    touchMemberLastVisit ? 1 : 0,
    new Date().toISOString(),
  );
  logger.debug({ jobId: id, businessId, slug, triggerName }, "[notif-job-queue] job créé");
  return id;
}

// ── Transitions d'état ──────────────────────────────────────────────────────

function markJobRunning(id) {
  db.prepare(`
    UPDATE notification_jobs
    SET status = 'running', started_at = ?, attempt_count = attempt_count + 1
    WHERE id = ?
  `).run(new Date().toISOString(), id);
}

function markJobDone(id, batchId) {
  db.prepare(`
    UPDATE notification_jobs
    SET status = 'done', completed_at = ?, batch_id = ?
    WHERE id = ?
  `).run(new Date().toISOString(), batchId ?? null, id);
}

function markJobFailed(id, errorMsg) {
  db.prepare(`
    UPDATE notification_jobs
    SET status = 'failed', completed_at = ?, error = ?
    WHERE id = ?
  `).run(new Date().toISOString(), String(errorMsg ?? "unknown"), id);
}

// ── Lecture ─────────────────────────────────────────────────────────────────

function getJobById(id) {
  return db.prepare("SELECT * FROM notification_jobs WHERE id = ?").get(id);
}

/**
 * Retourne les jobs `pending` + les jobs `running` orphelins (démarrés il y a > 5 min,
 * signe d'un crash pendant le traitement).
 */
function getPendingOrOrphanedJobs(limit = 5) {
  const orphanThreshold = new Date(Date.now() - ORPHAN_THRESHOLD_MS).toISOString();
  return db.prepare(`
    SELECT * FROM notification_jobs
    WHERE
      (status = 'pending')
      OR (status = 'running' AND started_at < ?)
    ORDER BY created_at ASC
    LIMIT ?
  `).all(orphanThreshold, limit);
}

function cleanOldJobs() {
  const cutoff = new Date(Date.now() - JOB_RETENTION_DAYS * 24 * 3600 * 1000).toISOString();
  const r = db.prepare(`
    DELETE FROM notification_jobs
    WHERE status IN ('done', 'failed') AND created_at < ?
  `).run(cutoff);
  if (r.changes > 0) {
    logger.info({ deleted: r.changes }, "[notif-job-queue] anciens jobs supprimés");
  }
}

// ── Exécution d'un job ──────────────────────────────────────────────────────

async function runJob(job) {
  // Abandon si trop de tentatives (évite une boucle infinie sur erreur permanente).
  if (job.attempt_count >= MAX_ATTEMPTS) {
    markJobFailed(job.id, `Abandon après ${MAX_ATTEMPTS} tentatives`);
    logger.warn({ jobId: job.id, businessId: job.business_id }, "[notif-job-queue] job abandonné (max tentatives)");
    return;
  }

  markJobRunning(job.id);
  logger.info(
    { jobId: job.id, businessId: job.business_id, slug: job.slug, attempt: job.attempt_count + 1 },
    "[notif-job-queue] exécution job"
  );

  try {
    const business = getBusinessById(job.business_id);
    if (!business) {
      markJobFailed(job.id, `Commerce introuvable : ${job.business_id}`);
      logger.warn({ jobId: job.id, businessId: job.business_id }, "[notif-job-queue] commerce introuvable");
      return;
    }

    // Désérialiser les member_ids (null = tous les abonnés).
    let memberIds = null;
    if (job.member_ids) {
      try { memberIds = JSON.parse(job.member_ids); } catch (_) { memberIds = null; }
    }

    const result = await deliverCustomerBroadcast({
      business,
      slug: job.slug,
      apiBase: job.api_base,
      memberIds,
      title: job.title ?? null,
      bodyMessage: job.body,
      triggerName: job.trigger_name,
      logTypePasskit: "passkit",
      merchantUserId: job.merchant_user_id ?? null,
      sendMerchantReceipt: true,
      touchMemberLastVisit: job.touch_member_last_visit === 1,
    });

    markJobDone(job.id, result.batchId ?? null);
    logger.info(
      {
        jobId: job.id,
        batchId: result.batchId,
        sent: result.sent,
        sentPassKit: result.sentPassKit,
        sentWebPush: result.sentWebPush,
        failed: result.failed,
      },
      "[notif-job-queue] job terminé"
    );
  } catch (err) {
    markJobFailed(job.id, err?.message ?? String(err));
    logger.error({ err, jobId: job.id, businessId: job.business_id }, "[notif-job-queue] job échoué");
  }
}

// ── Worker de récupération ──────────────────────────────────────────────────

let workerBusy = false;

async function workerTick() {
  if (workerBusy) return; // Évite le chevauchement si le précédent tick dure plus de 30s.
  workerBusy = true;
  try {
    const jobs = getPendingOrOrphanedJobs(5);
    if (jobs.length > 0) {
      logger.info({ count: jobs.length }, "[notif-job-queue] reprise de jobs en attente");
      for (const job of jobs) {
        await runJob(job);
      }
    }
  } catch (err) {
    logger.error({ err }, "[notif-job-queue] erreur worker tick");
  } finally {
    workerBusy = false;
  }
}

/**
 * Démarre le worker de récupération.
 * À appeler UNE FOIS dans `startServer()` de index.js.
 */
export function startNotificationJobWorker() {
  if (process.env.NODE_ENV === "test") return;

  // Nettoyage au démarrage (synchrone, silencieux).
  try { cleanOldJobs(); } catch (_) {}

  // Premier passage 5 secondes après le démarrage (laisse les connexions DB s'établir).
  setTimeout(workerTick, 5_000);

  // Passage régulier (filet de sécurité uniquement — le chemin nominal est setImmediate).
  setInterval(workerTick, WORKER_POLL_MS);

  logger.info("[notif-job-queue] worker démarré (1er passage dans 5s, puis toutes les 30s)");
}

// ── API publique ────────────────────────────────────────────────────────────

/**
 * Crée un job persistant ET lance l'exécution immédiate via setImmediate.
 *
 * GARANTIE : même si le process crash après l'appel à cette fonction et avant que
 * setImmediate s'exécute, le job reste en base avec status='pending' et sera repris
 * au prochain démarrage par le worker.
 *
 * @param {Parameters<typeof createNotificationJob>[0]} params
 * @returns {string} jobId — à inclure dans la réponse 202 pour que le client puisse tracker.
 */
export function enqueueNotificationJob(params) {
  const jobId = createNotificationJob(params);

  // Chemin rapide : exécution dans la prochaine itération de la boucle d'événements.
  // Évite de bloquer la réponse HTTP tout en restant quasi-instantané.
  setImmediate(async () => {
    const job = getJobById(jobId);
    if (!job || job.status !== "pending") return; // Déjà traité (ex: worker rapide)
    try {
      await runJob(job);
    } catch (err) {
      logger.error({ err, jobId }, "[notif-job-queue] erreur setImmediate");
    }
  });

  return jobId;
}
