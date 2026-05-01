/**
 * Actions section Notifications.
 * @param {{
 * api: (path: string, init?: RequestInit) => Promise<Response>;
 * messageInput: HTMLTextAreaElement | null;
 * sendBtn: HTMLButtonElement | null;
 * saveBtn: HTMLButtonElement | null;
 * setFeedback: (text: string, isError?: boolean) => void;
 * onSaveRequested: () => void;
 * }} opts
 */
export function bindSettingsNotifications(opts) {
  opts.saveBtn?.addEventListener("click", () => opts.onSaveRequested());
  opts.sendBtn?.addEventListener("click", async () => {
    const message = String(opts.messageInput?.value || "").trim();
    if (!message) {
      opts.setFeedback("Ajoutez un message avant l’envoi.", true);
      return;
    }
    if (opts.sendBtn) opts.sendBtn.disabled = true;
    opts.setFeedback("");
    const res = await opts.api("/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await res.json().catch(() => ({}));
    if (opts.sendBtn) opts.sendBtn.disabled = false;
    if (!res.ok) {
      opts.setFeedback(data.error || "Envoi impossible.", true);
      return;
    }
    opts.setFeedback("Notification envoyee.");
  });
}
