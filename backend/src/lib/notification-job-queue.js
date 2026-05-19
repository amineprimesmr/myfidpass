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
 *   pending → running → done                 (chemin nominal)
 *   pending → running → failed               (erreur — automatiquement retentée jusqu'à MAX_ATTEMPTS)
 *   pending → running → failed → dead        (DLQ après MAX_ATTEMPTS atteintes, alerte admin envoyée)
 *   running (orphelin) → running → done/failed  (repris par le worker après redémarrage)
 *
 * BACKOFF ENTRE TENTATIVES :
 *   tentative 1 → immédiat
 *   tentative 2 → +1 min (next_attempt_at)
 *   tentative 3 → +5 min
 *   tentative 4 → +30 min puis DEAD si échec
 *
 * SÉCURITÉS AJOUTÉES :
 *   - Lock atomique (`UPDATE ... WHERE status = 'pending' RETURNING`) : évite que 2 workers
 *     traitent le même job en concurrent (multi-instance Railway = doublons d'envoi de campagne sinon).
 *   - `last_heartbeat_at` mis à jour pendant l'exécution → détection orphelin fine.
 *   - Métriques exposées via `getQueueStats()` pour `/api/health/notifications`.
 */
import { randomUUID } from "crypto";
import { getDb } from "../db/connection.js";
import { getBusinessById } from "../db/businesses.js";
import { deliverCustomerBroadcast } from "../notifications/dispatch.js";
import { notifyAdminsPlatformEvent } from "./admin-notify.js";
import { businessHasCustomNotificationIcon } from "./notification-icon-gate.js";
import logger from "./logger.js";

const db = getDb();

// ── Constantes ──────────────────────────────────────────────────────────────

/** Nombre max de tentatives avant d'abandonner un job (passe en `dead`). */
const MAX_ATTEMPTS = 4;

/** Intervalle du worker de récupération (ms). */
const WORKER_POLL_MS = 30_000;

/** Conservation des jobs terminés (jours). */
const JOB_RETENTION_DAYS = 7;

/** Conservation des jobs `dead` (DLQ) — plus long pour permettre audit. */
const DEAD_JOB_RETENTION_DAYS = 30;

/**
 * Un job `running` qui n'a pas envoyé de heartbeat depuis ce seuil est considéré orphelin
 * (crash du process précédent ou tâche infinie). Le worker le reprend.
 */
const ORPHAN_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Backoff cumulé en ms : index = attempt_count *avant* la tentative qui vient d'échouer.
 * Donc après 0 tentative (job neuf) → next_attempt_at = maintenant.
 * Après 1 tentative échouée → +60s. Après 2 → +300s. Après 3 → +1800s.
 */
const RETRY_BACKOFF_MS = [0, 60_000, 300_000, 1_800_000];

// ── Schema (idempotent) ─────────────────────────────────────────────────────
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

// Migrations idempotentes pour les colonnes ajoutées (next_attempt_at + last_heartbeat_at).
const existingCols = db.prepare("PRAGMA table_info(notification_jobs)").all().map((c) => c.name);
if (!existingCols.includes("next_attempt_at")) {
  try {
    db.exec("ALTER TABLE notification_jobs ADD COLUMN next_attempt_at TEXT");
  } catch (_) {}
}
if (!existingCols.includes("last_heartbeat_at")) {
  try {
    db.exec("ALTER TABLE notification_jobs ADD COLUMN last_heartbeat_at TEXT");
  } catch (_) {}
}
// Index complémentaire pour la requête de pickup atomique (par next_attempt_at).
try {
  db.exec("CREATE INDEX IF NOT EXISTS idx_notif_jobs_pending_next ON notification_jobs(status, next_attempt_at, created_at)");
} catch (_) {}

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
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO notification_jobs
      (id, business_id, slug, api_base, member_ids, title, body,
       trigger_name, merchant_user_id, touch_member_last_visit, status, created_at, next_attempt_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
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
    now,
    now,
  );
  logger.debug({ jobId: id, businessId, slug, triggerName }, "[notif-job-queue] job créé");
  return id;
}

// ── Transitions d'état ──────────────────────────────────────────────────────

/**
 * Tente d'atteindre le statut `running` de manière ATOMIQUE depuis pending|failed.
 * Utilise SQLite UPDATE ... WHERE pour garantir qu'un seul worker prend le job.
 * Retourne true si le pickup a réussi (le worker peut exécuter), false si un autre
 * worker a gagné la course (le job est déjà running ailleurs).
 *
 * Pourquoi atomique : sans ça, deux instances Railway exécuteraient la même
 * campagne en doublon → 2 push par client = très mauvaise UX + plainte CNIL possible.
 */
function tryAcquireJob(id) {
  const now = new Date().toISOString();
  // SQLite ne supporte pas RETURNING dans tous les builds — on fait UPDATE puis SELECT.
  const result = db.prepare(`
    UPDATE notification_jobs
    SET status = 'running', started_at = COALESCE(started_at, ?), last_heartbeat_at = ?,
        attempt_count = attempt_count + 1
    WHERE id = ?
      AND status IN ('pending', 'failed')
      AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
  `).run(now, now, id, now);
  return result.changes === 1;
}

function heartbeat(id) {
  try {
    db.prepare(`UPDATE notification_jobs SET last_heartbeat_at = ? WHERE id = ?`).run(new Date().toISOString(), id);
  } catch (_) {}
}

function markJobDone(id, batchId) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE notification_jobs
    SET status = 'done', completed_at = ?, batch_id = ?, last_heartbeat_at = ?, error = NULL
    WHERE id = ?
  `).run(now, batchId ?? null, now, id);
}

/**
 * Marque le job en `failed` + planifie la prochaine tentative (backoff).
 * Si max tentatives atteint → status `dead` (DLQ) + alerte admin.
 */
function markJobFailedOrDead(id, attemptCount, errorMsg) {
  const now = new Date().toISOString();
  const safeMsg = String(errorMsg ?? "unknown").slice(0, 500);
  if (attemptCount >= MAX_ATTEMPTS) {
    db.prepare(`
      UPDATE notification_jobs
      SET status = 'dead', completed_at = ?, error = ?, last_heartbeat_at = ?
      WHERE id = ?
    `).run(now, safeMsg, now, id);
    // Alerte admin (fire-and-forget — ne pas bloquer le worker)
    Promise.resolve()
      .then(() => {
        const job = getJobById(id);
        return notifyAdminsPlatformEvent({
          type: "notification_job_dead",
          subject: `[MyFidpass] Campagne en échec définitif (${job?.slug ?? "?"})`,
          body: `Job ${id} pour le commerce ${job?.business_id ?? "?"} (slug ${job?.slug ?? "?"}) a échoué ${attemptCount} fois et est passé en DLQ.\n\nErreur : ${safeMsg}\n\nDernière tentative : ${now}`,
        });
      })
      .catch((err) => logger.warn({ err, jobId: id }, "[notif-job-queue] alerte admin DLQ a échoué"));
    return "dead";
  }
  // Backoff : index = attempt_count (= nombre de tentatives écoulées avant celle-ci)
  const backoffMs = RETRY_BACKOFF_MS[Math.min(attemptCount, RETRY_BACKOFF_MS.length - 1)] || 60_000;
  const nextAttemptAt = new Date(Date.now() + backoffMs).toISOString();
  db.prepare(`
    UPDATE notification_jobs
    SET status = 'failed', completed_at = ?, error = ?, last_heartbeat_at = ?, next_attempt_at = ?
    WHERE id = ?
  `).run(now, safeMsg, now, nextAttemptAt, id);
  return "failed";
}

// ── Lecture ─────────────────────────────────────────────────────────────────

function getJobById(id) {
  return db.prepare("SELECT * FROM notification_jobs WHERE id = ?").get(id);
}

/**
 * Retourne les jobs prêts à exécuter :
 *  - `pending` (jamais traités, dont next_attempt_at est passé)
 *  - `failed` retentables (next_attempt_at <= now, attempt_count < MAX_ATTEMPTS)
 *  - `running` orphelins (last_heartbeat_at > ORPHAN_THRESHOLD_MS — crash worker)
 */
function getPendingOrOrphanedJobs(limit = 5) {
  const now = new Date().toISOString();
  const orphanThreshold = new Date(Date.now() - ORPHAN_THRESHOLD_MS).toISOString();
  return db.prepare(`
    SELECT * FROM notification_jobs
    WHERE
      (status IN ('pending','failed') AND attempt_count < ? AND (next_attempt_at IS NULL OR next_attempt_at <= ?))
      OR (status = 'running' AND COALESCE(last_heartbeat_at, started_at) < ?)
    ORDER BY created_at ASC
    LIMIT ?
  `).all(MAX_ATTEMPTS, now, orphanThreshold, limit);
}

function cleanOldJobs() {
  const cutoffActive = new Date(Date.now() - JOB_RETENTION_DAYS * 24 * 3600 * 1000).toISOString();
  const cutoffDead = new Date(Date.now() - DEAD_JOB_RETENTION_DAYS * 24 * 3600 * 1000).toISOString();
  const r1 = db.prepare(`
    DELETE FROM notification_jobs
    WHERE status IN ('done', 'failed') AND created_at < ?
  `).run(cutoffActive);
  const r2 = db.prepare(`
    DELETE FROM notification_jobs
    WHERE status = 'dead' AND created_at < ?
  `).run(cutoffDead);
  if (r1.changes + r2.changes > 0) {
    logger.info({ deletedActive: r1.changes, deletedDead: r2.changes }, "[notif-job-queue] anciens jobs supprimés");
  }
}

/**
 * Statistiques de file pour `/api/health/notifications` et monitoring.
 * Lecture O(1) — utilise les index existants.
 */
export function getQueueStats() {
  try {
    const rows = db.prepare(`
      SELECT status, COUNT(*) as n FROM notification_jobs
      GROUP BY status
    `).all();
    const out = { pending: 0, running: 0, done: 0, failed: 0, dead: 0 };
    for (const r of rows) {
      if (r.status in out) out[r.status] = Number(r.n) || 0;
    }
    // Job le plus ancien encore en attente
    const oldestPending = db.prepare(`
      SELECT created_at FROM notification_jobs
      WHERE status IN ('pending','failed') AND attempt_count < ?
      ORDER BY created_at ASC LIMIT 1
    `).get(MAX_ATTEMPTS);
    return {
      ...out,
      oldest_pending_created_at: oldestPending?.created_at ?? null,
      worker_alive: !workerBusy ? "idle" : "busy",
    };
  } catch (e) {
    return { error: String(e?.message ?? e) };
  }
}

// ── Exécution d'un job ──────────────────────────────────────────────────────

async function runJob(job) {
  // Acquisition ATOMIQUE : si un autre worker a déjà pris ce job, on abandonne (pas d'envoi double).
  if (!tryAcquireJob(job.id)) {
    logger.debug({ jobId: job.id }, "[notif-job-queue] job déjà pris par un autre worker (skip)");
    return;
  }
  const currentAttempt = (job.attempt_count ?? 0) + 1;
  logger.info(
    { jobId: job.id, businessId: job.business_id, slug: job.slug, attempt: currentAttempt },
    "[notif-job-queue] exécution job"
  );

  // Heartbeat périodique pendant l'exécution (évite faux orphelin sur jobs longs).
  const heartbeatInterval = setInterval(() => heartbeat(job.id), 60_000);

  try {
    const business = getBusinessById(job.business_id);
    if (!business) {
      clearInterval(heartbeatInterval);
      // Commerce supprimé : ce n'est PAS une erreur retentable → mort direct.
      markJobFailedOrDead(job.id, MAX_ATTEMPTS, `Commerce introuvable : ${job.business_id}`);
      logger.warn({ jobId: job.id, businessId: job.business_id }, "[notif-job-queue] commerce introuvable — DLQ");
      return;
    }
    if (!businessHasCustomNotificationIcon(business)) {
      clearInterval(heartbeatInterval);
      markJobDone(job.id, null);
      logger.warn(
        { jobId: job.id, businessId: job.business_id },
        "[notif-job-queue] job annulé — icône de notification personnalisée absente"
      );
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

    clearInterval(heartbeatInterval);
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
    clearInterval(heartbeatInterval);
    const newStatus = markJobFailedOrDead(job.id, currentAttempt, err?.message ?? String(err));
    logger.error(
      { err, jobId: job.id, businessId: job.business_id, attempt: currentAttempt, status: newStatus },
      "[notif-job-queue] job échoué"
    );
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

let workerStarted = false;
let cleanupIntervalRef = null;
let workerIntervalRef = null;

/**
 * Démarre le worker de récupération.
 * À appeler UNE FOIS dans `startServer()` de index.js. Idempotent.
 */
export function startNotificationJobWorker() {
  if (process.env.NODE_ENV === "test") return;
  if (workerStarted) return;
  workerStarted = true;

  // Nettoyage au démarrage (synchrone, silencieux).
  try { cleanOldJobs(); } catch (_) {}

  // Premier passage 5 secondes après le démarrage (laisse les connexions DB s'établir).
  setTimeout(workerTick, 5_000);

  // Passage régulier (filet de sécurité + retentatives backoff).
  workerIntervalRef = setInterval(workerTick, WORKER_POLL_MS);

  // Cleanup périodique des vieux jobs (1× par heure).
  cleanupIntervalRef = setInterval(() => {
    try { cleanOldJobs(); } catch (_) {}
  }, 60 * 60 * 1000);

  logger.info(
    { pollMs: WORKER_POLL_MS, maxAttempts: MAX_ATTEMPTS, orphanThresholdMs: ORPHAN_THRESHOLD_MS },
    "[notif-job-queue] worker démarré"
  );
}

/**
 * Arrêt gracieux (pour les tests ou shutdown propre).
 */
export function stopNotificationJobWorker() {
  if (workerIntervalRef) { clearInterval(workerIntervalRef); workerIntervalRef = null; }
  if (cleanupIntervalRef) { clearInterval(cleanupIntervalRef); cleanupIntervalRef = null; }
  workerStarted = false;
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
  // L'acquisition atomique dans `runJob` empêche un double-run si le worker tick
  // démarre simultanément.
  setImmediate(async () => {
    const job = getJobById(jobId);
    if (!job) return;
    try {
      await runJob(job);
    } catch (err) {
      logger.error({ err, jobId }, "[notif-job-queue] erreur setImmediate");
    }
  });

  return jobId;
}

/**
 * Force la réémission d'un job `dead` ou `failed` (admin/support).
 * Remet à zéro `attempt_count` et `next_attempt_at` puis enqueue.
 */
export function requeueDeadJob(jobId) {
  const job = db.prepare("SELECT * FROM notification_jobs WHERE id = ?").get(jobId);
  if (!job) return false;
  db.prepare(`
    UPDATE notification_jobs
    SET status = 'pending', attempt_count = 0, next_attempt_at = ?, error = NULL,
        completed_at = NULL, last_heartbeat_at = NULL, started_at = NULL, batch_id = NULL
    WHERE id = ?
  `).run(new Date().toISOString(), jobId);
  // Relance setImmediate
  setImmediate(async () => {
    const refreshed = db.prepare("SELECT * FROM notification_jobs WHERE id = ?").get(jobId);
    if (refreshed) {
      try { await runJob(refreshed); }
      catch (err) { logger.error({ err, jobId }, "[notif-job-queue] requeue runJob err"); }
    }
  });
  return true;
}
