/**
 * Seed minimal DB pour test GET pass PassKit (membre a86a5b11... + 1 business).
 * À lancer avec: DATA_DIR=./test-data node scripts/seed-passkit-test.js
 */
import { createBusiness, createMember, getMember, getBusinessById } from "../src/db.js";

const SERIAL = "a86a5b11-0b01-4076-b853-5c369807ce55";
const biz = createBusiness({
  name: "Café test",
  slug: "cafe-nbk",
  organizationName: "café nbk",
});
createMember({ id: SERIAL, businessId: biz.id, email: "test@test.com", name: "Amine" });
console.log("Seed OK: member", SERIAL.slice(0, 8) + "...", "business", biz.id);

const m = getMember(SERIAL);
const b = getBusinessById(m.business_id);
console.log("Vérif: member.points =", m.points, "business =", b?.slug);
