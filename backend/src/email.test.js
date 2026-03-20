import { describe, it, expect, vi, afterEach } from "vitest";

describe("email", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.MAIL_FROM;
    vi.resetModules();
  });

  it("sendMail utilise Resend quand RESEND_API_KEY est défini", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.MAIL_FROM = "onboarding@resend.dev";
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", mockFetch);
    const { sendMail } = await import("./email.js");
    const r = await sendMail({ to: "user@example.com", subject: "Sujet", text: "Corps" });
    expect(r.sent).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("isEmailConfigured est true avec Resend", async () => {
    process.env.RESEND_API_KEY = "re_x";
    const { isEmailConfigured, getEmailTransportLabel } = await import("./email.js");
    expect(isEmailConfigured()).toBe(true);
    expect(getEmailTransportLabel()).toBe("resend");
  });
});
