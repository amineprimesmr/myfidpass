/**
 * Barrel : réexporte tout le module db (connection + repositories).
 * Les autres fichiers du backend importent depuis "../db.js" qui réexporte ce module.
 * Référence : REFONTE-REGLES.md.
 */
import db from "./connection.js";
export { DATA_DIR_PATH, DB_FILE_PATH, getDb } from "./connection.js";
export { db };
export default db;

export * from "./users.js";
export * from "./businesses.js";
export * from "./members.js";
export * from "./transactions.js";
export * from "./subscriptions.js";
export * from "./level.js";
export * from "./categories.js";
export * from "./passes.js";
export * from "./webpush.js";
export * from "./dashboard.js";
export * from "./games.js";
export { businessUsesTicketBonuses, addTicketsForProfileComplete } from "./games-helpers.js";
export { completeMemberProfileForTicket } from "./member-profile-bonus.js";
export * from "./engagement.js";
export * from "./engagement-proof.js";
export * from "./reset.js";
