#!/usr/bin/env node
/**
 * Démarre backend + frontend en une commande.
 * Usage: node scripts/start-all.mjs  ou  npm start
 */
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { freeBackendPort } from "./free-backend-port.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const backendPort = Number(process.env.PORT) || 3001;
freeBackendPort(backendPort);

const isWin = process.platform === "win32";
const back = spawn("node", ["backend/src/index.js"], {
  cwd: root,
  stdio: "inherit",
  shell: isWin,
});
const front = spawn(isWin ? "npm.cmd" : "npm", ["run", "dev", "--prefix", "frontend"], {
  cwd: root,
  stdio: "inherit",
  shell: isWin,
});

console.log("\n  Backend  → http://localhost:3001");
console.log("  Frontend → http://localhost:5174");
console.log("  Carte fidélité → http://localhost:5174/fidelity/demo\n");

function killAll() {
  back.kill();
  front.kill();
  process.exit(0);
}

back.on("error", (err) => console.error("Backend:", err.message));
front.on("error", (err) => console.error("Frontend:", err.message));
back.on("exit", (code) => { if (code !== 0 && code !== null) front.kill(); });
front.on("exit", (code) => { if (code !== 0 && code !== null) back.kill(); });

process.on("SIGINT", killAll);
process.on("SIGTERM", killAll);
