/**
 * Après ajout d’une icône de notification : relancer jobs/campagnes bloqués sans icône.
 */
import { getDb } from "../db/connection.js";
import { getBusinessById } from "../db/businesses.js";
import { businessHasCustomNotificationIcon } from "./notification-icon-gate.js";
import logger from "./logger.js";

const db = getDb();

const ICON_SKIP_REASON = "Icône de notification personnalisée requise";
const ICON_JOB_ERROR = "Icône notification requise — en attente";

/**
 * À appeler dès qu’une icône notif vient d’être enregistrée pour un commerce.
 * @param {string} businessId
 */
export function recoverNotificationsAfterIconUpload(businessId) {
  if (!businessId) return;
  const business = getBusinessById(businessId);
  if (!businessHasCustomNotificationIcon(business)) return;

  const reopenedEvents = db
    .prepare(
      `UPDATE campaign_event_jobs
       SET status = 'queued', processing_at = NULL, processed_at = NULL, last_error = NULL,
           run_at = datetime('now', '+1 minute')
       WHERE business_id = ? AND status = 'skipped' AND last_error LIKE ?`
    )
    .run(businessId, `%${ICON_SKIP_REASON}%`);

  const reopenedJobs = db
    .prepare(
      `UPDATE notification_jobs
       SET status = 'pending', started_at = NULL, completed_at = NULL, batch_id = NULL,
           error = NULL, next_attempt_at = NULL, last_heartbeat_at = NULL,
           attempt_count = MAX(0, attempt_count - 1)
       WHERE business_id = ? AND status = 'failed' AND error LIKE ?`
    )
    .run(businessId, `%${ICON_JOB_ERROR}%`);

  if ((reopenedEvents.changes ?? 0) > 0 || (reopenedJobs.changes ?? 0) > 0) {
    logger.info(
      {
        businessId,
        reopenedEventJobs: reopenedEvents.changes ?? 0,
        reopenedNotificationJobs: reopenedJobs.changes ?? 0,
      },
      "[notification-icon-recovery] relance après icône notif"
    );
  }
}
