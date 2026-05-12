import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateKeyPairSync } from "crypto";
import jwt from "jsonwebtoken";
import { getGoogleWalletSaveUrl, isGoogleWalletConfigured } from "./google-wallet.js";

describe("google-wallet", () => {
  const prevIssuer = process.env.GOOGLE_WALLET_ISSUER_ID;
  const prevJson = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON;
  const prevClassId = process.env.GOOGLE_WALLET_CLASS_ID;

  let publicKey;
  let serviceAccountJson;

  beforeEach(() => {
    const pair = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    publicKey = pair.publicKey;
    serviceAccountJson = JSON.stringify({
      client_email: "wallet-test@project.iam.gserviceaccount.com",
      private_key: pair.privateKey,
    });
    process.env.GOOGLE_WALLET_ISSUER_ID = "3388000000000000001";
    process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON = serviceAccountJson;
  });

  afterEach(() => {
    if (prevIssuer === undefined) delete process.env.GOOGLE_WALLET_ISSUER_ID;
    else process.env.GOOGLE_WALLET_ISSUER_ID = prevIssuer;
    if (prevJson === undefined) delete process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON;
    else process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON = prevJson;
    if (prevClassId === undefined) delete process.env.GOOGLE_WALLET_CLASS_ID;
    else process.env.GOOGLE_WALLET_CLASS_ID = prevClassId;
  });

  it("isGoogleWalletConfigured is true when issuer and JSON are valid", () => {
    expect(isGoogleWalletConfigured()).toBe(true);
  });

  it("isGoogleWalletConfigured is false when issuer id missing", () => {
    delete process.env.GOOGLE_WALLET_ISSUER_ID;
    expect(isGoogleWalletConfigured()).toBe(false);
  });

  it("isGoogleWalletConfigured is false when service account JSON is invalid", () => {
    process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON = "{not json";
    expect(isGoogleWalletConfigured()).toBe(false);
  });

  it("isGoogleWalletConfigured is false when private_key missing", () => {
    process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: "x@y.iam.gserviceaccount.com",
    });
    expect(isGoogleWalletConfigured()).toBe(false);
  });

  it("getGoogleWalletSaveUrl returns null when not configured", () => {
    delete process.env.GOOGLE_WALLET_ISSUER_ID;
    expect(getGoogleWalletSaveUrl({ id: "m1" }, { id: "b1" }, "https://x.fr")).toBeNull();
  });

  it("accepts service account private keys stored with escaped newlines", () => {
    process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: "wallet-test@project.iam.gserviceaccount.com",
      private_key: serviceAccountJson
        ? JSON.parse(serviceAccountJson).private_key.replace(/\n/g, "\\n")
        : "",
    });

    const result = getGoogleWalletSaveUrl(
      { id: "mem_escape", name: "Jean Dupont", email: "j@ex.fr", points: 3 },
      { id: "bus_escape", organization_name: "Café Test" },
      "https://myfidpass.fr"
    );
    expect(result?.url.startsWith("https://pay.google.com/gp/v/save/")).toBe(true);
  });

  it("getGoogleWalletSaveUrl returns a save URL and a JWT Google can parse structurally", () => {
    const member = { id: "mem_abc-1", name: "Jean Dupont", email: "j@ex.fr", points: "42" };
    const business = { id: "bus_xyz", organization_name: "Café Test" };
    const { url } = getGoogleWalletSaveUrl(member, business, "https://myfidpass.fr/");
    expect(url.startsWith("https://pay.google.com/gp/v/save/")).toBe(true);
    const token = url.slice("https://pay.google.com/gp/v/save/".length);
    const decoded = jwt.verify(token, publicKey, { algorithms: ["RS256"] });
    expect(decoded.iss).toBe("wallet-test@project.iam.gserviceaccount.com");
    expect(decoded.aud).toBe("google");
    expect(decoded.typ).toBe("savetowallet");
    expect(decoded.origins).toEqual(["https://myfidpass.fr"]);

    const inner = decoded.payload;
    const [loyaltyClass] = inner.loyaltyClasses;
    expect(loyaltyClass.id).toBe("3388000000000000001.business_bus_xyz");
    expect(loyaltyClass.programName).toBe("Café Test");
    expect(loyaltyClass.reviewStatus).toBe("UNDER_REVIEW");
    expect(loyaltyClass.programLogo.sourceUri.uri).toBe("https://myfidpass.fr/assets/icone.png?v=20260416");
    expect(loyaltyClass.classTemplateInfo.cardTemplateOverride.cardRowTemplateInfos.length).toBeGreaterThan(0);

    const [loyaltyObject] = inner.loyaltyObjects;
    expect(loyaltyObject.classId).toBe(loyaltyClass.id);
    expect(loyaltyObject.id).toBe("3388000000000000001.business_bus_xyz_mem_abc-1");
    expect(loyaltyObject.loyaltyPoints.balance.int).toBe(42);
    expect(loyaltyObject.secondaryLoyaltyPoints.balance.string).toContain("Récompense");
    expect(loyaltyObject.barcode.type).toBe("QR_CODE");
    expect(loyaltyObject.barcode.value).toBe("mem_abc-1");
  });

  it("uses a business-scoped loyalty class and defaults origin", () => {
    const { url } = getGoogleWalletSaveUrl(
      { id: "m1", points: 0 },
      { id: "café 🎉", organization_name: "X" },
      ""
    );
    const token = url.slice("https://pay.google.com/gp/v/save/".length);
    const decoded = jwt.verify(token, publicKey, { algorithms: ["RS256"] });
    expect(decoded.origins).toEqual(["https://myfidpass.fr"]);
    const [cls] = decoded.payload.loyaltyClasses;
    expect(cls.id).toBe("3388000000000000001.business_caf____");
  });

  it("can reference an already approved class without embedding a new class", () => {
    process.env.GOOGLE_WALLET_CLASS_ID = "3388000000000000001.approved_class";
    const { url } = getGoogleWalletSaveUrl(
      { id: "m1", points: 0 },
      { id: "b1", organization_name: "X" },
      "https://myfidpass.fr"
    );
    const token = url.slice("https://pay.google.com/gp/v/save/".length);
    const decoded = jwt.verify(token, publicKey, { algorithms: ["RS256"] });
    expect(decoded.payload.loyaltyClasses).toBeUndefined();
    expect(decoded.payload.loyaltyObjects[0].classId).toBe("3388000000000000001.approved_class");
    delete process.env.GOOGLE_WALLET_CLASS_ID;
  });
});
