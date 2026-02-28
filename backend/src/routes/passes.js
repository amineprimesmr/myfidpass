import { Router } from "express";
import { generatePass } from "../pass.js";

const router = Router();

/**
 * GET /api/passes/demo?template=fastfood-points|fastfood-tampons|...
 * Génère un .pkpass de démo pour tester l’apparence sur iPhone (Apple Wallet).
 * Pas d’auth requise.
 */
const SECTOR_TEMPLATES = ["fastfood", "burger", "beauty", "coiffure", "boulangerie", "boucherie", "cafe"];
const LEGACY_MAP = { classic: "classic", bold: "modern", elegant: "warm" };

router.get("/demo", async (req, res) => {
  const templateParam = (req.query.template || "fastfood-points").toLowerCase();
  let template = LEGACY_MAP[templateParam] || "classic";
  let format = "points";
  const sector = SECTOR_TEMPLATES.find((s) => templateParam === `${s}-points` || templateParam === `${s}-tampons`);
  if (sector) {
    template = sector;
    format = templateParam.endsWith("-tampons") ? "tampons" : "points";
  }

  const member = {
    id: `demo-${templateParam}-${Date.now()}`,
    name: "Démo",
    points: 0,
  };

  try {
    const buffer = await generatePass(member, null, { template, format });
    const filename = `fidelity-demo-${templateParam}.pkpass`;
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error("Génération pass démo:", err);
    res.status(500).json({
      error: "Impossible de générer la carte de démo.",
      detail: err.message,
    });
  }
});

export default router;
