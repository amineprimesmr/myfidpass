import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/businesses.js", () => ({
  getBusinessById: vi.fn(),
  bumpBusinessPassRefreshTimestamp: vi.fn(),
}));

vi.mock("../db/passes.js", () => ({
  getPushTokensForMember: vi.fn(),
}));

vi.mock("../apns.js", () => ({
  sendPassKitUpdate: vi.fn(),
}));

vi.mock("./notification-icon-gate.js", () => ({
  businessAllowsWalletCustomerAlerts: vi.fn(),
}));

import { getBusinessById, bumpBusinessPassRefreshTimestamp } from "../db/businesses.js";
import { getPushTokensForMember } from "../db/passes.js";
import { sendPassKitUpdate } from "../apns.js";
import { businessAllowsWalletCustomerAlerts } from "./notification-icon-gate.js";
import {
  pushPassKitUpdateForMember,
  sendPassKitUpdateIfCustomerAlertsAllowed,
} from "./passkit-member-push.js";

describe("pushPassKitUpdateForMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBusinessById.mockReturnValue({ id: "biz-1" });
    getPushTokensForMember.mockReturnValue(["tok-a"]);
    sendPassKitUpdate.mockResolvedValue({ sent: true });
  });

  it("pousse PassKit et bump le timestamp même sans icône notif", async () => {
    businessAllowsWalletCustomerAlerts.mockReturnValue(false);

    const result = await pushPassKitUpdateForMember("biz-1", "mem-1", "integration_scan");

    expect(bumpBusinessPassRefreshTimestamp).toHaveBeenCalledWith("biz-1");
    expect(sendPassKitUpdate).toHaveBeenCalledWith("tok-a", expect.objectContaining({ collapseId: expect.any(String) }));
    expect(result).toMatchObject({ tokens: 1, sent: 1, lockScreenAlerts: false });
  });

  it("pousse PassKit quand icône notif présente", async () => {
    businessAllowsWalletCustomerAlerts.mockReturnValue(true);

    const result = await pushPassKitUpdateForMember("biz-1", "mem-1", "points_add");

    expect(result).toMatchObject({ tokens: 1, sent: 1, lockScreenAlerts: true });
  });
});

describe("sendPassKitUpdateIfCustomerAlertsAllowed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reste gated sans icône notif", async () => {
    businessAllowsWalletCustomerAlerts.mockReturnValue(false);

    const result = await sendPassKitUpdateIfCustomerAlertsAllowed({ id: "biz-1" }, "tok-a");

    expect(result).toMatchObject({ sent: false, skipped: true });
    expect(sendPassKitUpdate).not.toHaveBeenCalled();
  });
});
