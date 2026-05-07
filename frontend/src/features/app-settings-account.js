/**
 * Actions section Profil (compte).
 * @param {{
 * changePasswordBtn: HTMLButtonElement | null;
 * emailInput: HTMLInputElement | null;
 * setFeedback: (text: string, isError?: boolean) => void;
 * }} opts
 */
export function bindSettingsAccount(opts) {
  opts.changePasswordBtn?.addEventListener("click", async () => {
    const email = String(opts.emailInput?.value || "").trim();
    if (!email) return opts.setFeedback("Email introuvable. Rechargez la page.", true);
    opts.changePasswordBtn.disabled = true;
    opts.setFeedback("");
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    opts.changePasswordBtn.disabled = false;
    if (!res) return opts.setFeedback("Erreur reseau. Reessayez.", true);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return opts.setFeedback(data.error || "Envoi impossible.", true);
    opts.setFeedback(data.message || "Email de reinitialisation envoye.");
  });
}
