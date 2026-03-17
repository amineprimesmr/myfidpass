#!/usr/bin/env node
import { spawn, spawnSync } from "child_process";
import { existsSync, mkdirSync, openSync } from "fs";
import net from "net";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const stateDir = join(root, ".dev-local");
const node22Bin = "/opt/homebrew/opt/node@22/bin";
const nodeCmd = existsSync(join(node22Bin, "node")) ? join(node22Bin, "node") : "node";
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const env = {
  ...process.env,
  PATH: existsSync(node22Bin) ? `${node22Bin}:${process.env.PATH || ""}` : (process.env.PATH || ""),
};

const services = {
  backend: {
    cmd: nodeCmd,
    args: ["backend/src/index.js"],
    cwd: root,
    port: 3001,
    log: join(stateDir, "backend.guardian.log"),
    requiredPaths: [
      join(root, "backend", "node_modules", "better-sqlite3"),
      join(root, "backend", "node_modules", "express"),
    ],
    repairCommand: [npmCmd, ["ci", "--prefix", "backend"]],
  },
  frontend: {
    cmd: npmCmd,
    args: ["run", "dev", "--prefix", "frontend"],
    cwd: root,
    port: 5174,
    log: join(stateDir, "frontend.guardian.log"),
    requiredPaths: [
      join(root, "frontend", "node_modules", "react-dom"),
      join(root, "frontend", "node_modules", "source-map-js"),
      join(root, "frontend", "node_modules", "browserslist"),
    ],
    repairCommand: [npmCmd, ["ci", "--prefix", "frontend"]],
  },
};

const children = { backend: null, frontend: null };
const restartTimers = { backend: null, frontend: null };
let isShuttingDown = false;

if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });

function log(msg) {
  const stamp = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.log(`[dev-guardian] ${stamp} ${msg}`);
}

function isPortOpen(port, host) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(600);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

async function checkPort(port) {
  if (await isPortOpen(port, "127.0.0.1")) return true;
  return isPortOpen(port, "::1");
}

function ensureDeps(serviceName, conf) {
  const missing = conf.requiredPaths.some((p) => !existsSync(p));
  if (!missing) return;
  log(`${serviceName}: dépendances manquantes, réparation automatique...`);
  const [cmd, args] = conf.repairCommand;
  const out = openSync(conf.log, "a");
  const result = spawnSync(cmd, args, {
    cwd: conf.cwd,
    env,
    stdio: ["ignore", out, out],
  });
  if (result.status !== 0) {
    log(`${serviceName}: échec réparation dépendances (code ${result.status ?? "?"})`);
  } else {
    log(`${serviceName}: dépendances réparées`);
  }
}

function scheduleRestart(serviceName, delayMs = 1200) {
  if (isShuttingDown) return;
  if (restartTimers[serviceName]) return;
  restartTimers[serviceName] = setTimeout(() => {
    restartTimers[serviceName] = null;
    void ensureService(serviceName);
  }, delayMs);
}

function spawnService(serviceName, conf) {
  const out = openSync(conf.log, "a");
  const child = spawn(conf.cmd, conf.args, {
    cwd: conf.cwd,
    env,
    stdio: ["ignore", out, out],
  });
  children[serviceName] = child;
  log(`${serviceName}: démarré (pid ${child.pid})`);

  child.on("exit", (code, signal) => {
    children[serviceName] = null;
    if (isShuttingDown) return;
    log(`${serviceName}: arrêté (code=${code ?? "null"} signal=${signal ?? "null"})`);
    scheduleRestart(serviceName, 1400);
  });

  child.on("error", (err) => {
    log(`${serviceName}: erreur process (${err.message})`);
    children[serviceName] = null;
    scheduleRestart(serviceName, 1600);
  });
}

async function ensureService(serviceName) {
  if (isShuttingDown) return;
  const conf = services[serviceName];
  if (!conf) return;
  const existingUp = await checkPort(conf.port);
  if (existingUp) return;
  if (children[serviceName]) return;
  ensureDeps(serviceName, conf);
  spawnService(serviceName, conf);
}

async function watchdogLoop() {
  while (!isShuttingDown) {
    await ensureService("backend");
    await ensureService("frontend");
    await new Promise((r) => setTimeout(r, 3000));
  }
}

function shutdown() {
  isShuttingDown = true;
  for (const key of Object.keys(restartTimers)) {
    if (restartTimers[key]) clearTimeout(restartTimers[key]);
  }
  for (const key of Object.keys(children)) {
    const child = children[key];
    if (child && !child.killed) {
      try {
        child.kill("SIGTERM");
      } catch (_) {
        // ignore
      }
    }
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

log("démarrage guardian local");
void watchdogLoop();
