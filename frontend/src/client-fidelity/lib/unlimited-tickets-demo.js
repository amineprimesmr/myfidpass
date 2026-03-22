/**
 * Même règle partout (affichage + en-têtes API) : démo roue sans débit de tickets.
 * - localhost / 127.0.0.1 / ::1
 * - ou ?tickets=unlimited dans l’URL (n’importe quel hôte)
 */
export function isUnlimitedTicketsDemo() {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  const isLocal = h === "localhost" || h === "127.0.0.1" || h === "::1";
  const hasParam = window.location.search.includes("tickets=unlimited");
  return isLocal || hasParam;
}
