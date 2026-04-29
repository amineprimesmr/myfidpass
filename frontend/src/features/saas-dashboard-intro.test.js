/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  isDashIntroRevealDone,
  markDashIntroRevealDone,
  scheduleDashboardOnboardingReveal,
} from "./saas-dashboard-intro.js";

describe("saas-dashboard-intro", () => {
  beforeEach(() => {
    try {
      localStorage.removeItem("fidpass_dash_onboarding_reveal_v2");
    } catch (_) {}
  });

  afterEach(() => {
    try {
      localStorage.removeItem("fidpass_dash_onboarding_reveal_v2");
    } catch (_) {}
    vi.useRealTimers();
  });

  it("mark puis is confirme la clé", () => {
    expect(isDashIntroRevealDone()).toBe(false);
    markDashIntroRevealDone();
    expect(isDashIntroRevealDone()).toBe(true);
  });

  it("scheduleDashboardOnboardingReveal appelle après le délai", () => {
    vi.useFakeTimers();
    let n = 0;
    scheduleDashboardOnboardingReveal(() => {
      n += 1;
    });
    expect(n).toBe(0);
    vi.advanceTimersByTime(2000);
    expect(n).toBe(1);
    expect(isDashIntroRevealDone()).toBe(true);
  });
});
