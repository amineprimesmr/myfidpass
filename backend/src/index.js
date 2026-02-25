import express from "express";
import cors from "cors";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import membersRouter from "./routes/members.js";
import businessesRouter from "./routes/businesses.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: join(__dirname, "..", ".env") });

const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const app = express();
// En dev, accepter toute origine (localhost ou IP du Mac pour test iPhone)
const corsOrigin = process.env.NODE_ENV === "production" ? FRONTEND_URL : true;
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

app.use("/api/members", membersRouter);
app.use("/api/businesses", businessesRouter);

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

function startServer(port) {
  const p = Number(port) || 3001;
  const server = app.listen(p, () => {
    console.log(`Backend fidélité: http://localhost:${server.address().port}`);
    console.log(`  API: /api/businesses/:slug, /api/members`);
  });
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`Port ${p} occupé, tentative sur ${p + 1}...`);
      startServer(p + 1);
    } else {
      throw err;
    }
  });
}

startServer(PORT);
