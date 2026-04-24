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
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "",
      json: async () => ({ id: "re_test_id" }),
    });
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

  it("Resend : second essai avec onboarding@resend.dev si le premier appel échoue", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.MAIL_FROM = "noreply@unverified.example";
    let n = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      n += 1;
      if (n === 1) {
        return Promise.resolve({
          ok: false,
          text: async () => JSON.stringify({ message: "Domain not verified" }),
        });
      }
      return Promise.resolve({
        ok: true,
        text: async () => "",
        json: async () => ({ id: "re_second_ok" }),
      });
    });
    vi.stubGlobal("fetch", mockFetch);
    const { sendMail } = await import("./email.js");
    const r = await sendMail({ to: "user@example.com", subject: "Sujet", text: "Corps" });
    expect(r.sent).toBe(true);
    expect(r.resendId).toBe("re_second_ok");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(secondBody.from).toContain("onboarding@resend.dev");
  });
});
