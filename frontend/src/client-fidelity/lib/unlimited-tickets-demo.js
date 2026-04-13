/**
 * Démo locale uniquement : roue sans débit de tickets (localhost / 127.0.0.1 / ::1).
 */
export function isUnlimitedTicketsDemo() {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}
