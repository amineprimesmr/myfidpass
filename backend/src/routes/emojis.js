import { Router } from "express";

const router = Router();
const EMOJI_FAMILY_API = "https://www.emoji.family/api/emojis";

/**
 * GET /api/emojis?group=food-drink
 * Proxy vers Emoji.family pour éviter CORS depuis le frontend.
 */
router.get("/", async (req, res) => {
  const group = (req.query.group || "food-drink").trim();
  const url = `${EMOJI_FAMILY_API}?group=${encodeURIComponent(group)}`;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      res.status(response.status).json({ error: "Emoji API error" });
      return;
    }
    const data = await response.json();
    res.json(Array.isArray(data) ? data : []);
  } catch (e) {
    console.warn("[emojis] proxy fetch failed:", e?.message);
    res.status(502).json({ error: "Proxy failed" });
  }
});

export default router;
