#!/usr/bin/env node
import { execSync, spawn } from "child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "fs";
import net from "net";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const stateDir = join(root, ".dev-local");
const backendPidFile = join(stateDir, "backend.pid");
const frontendPidFile = join(stateDir, "frontend.pid");
const backendLog = join(stateDir, "backend.log");
const frontendLog = join(stateDir, "frontend.log");
const args = process.argv.slice(2);
const mode = (args.find((a) => !a.startsWith("-")) || "up").toLowerCase();
const noOpen = args.includes("--no-open");
const quiet = args.includes("--quiet");

const node22Bin = "/opt/homebrew/opt/node@22/bin";
const nodeCmd = existsSync(join(node22Bin, "node")) ? join(node22Bin, "node") : "node";
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const env = {
  ...process.env,
  PATH: existsSync(node22Bin) ? `${node22Bin}:${process.env.PATH || ""}` : (process.env.PATH || ""),
};

function ensureStateDir() {
  if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
}

function readPid(file) {
  if (!existsSync(file)) return null;
  const raw = readFileSync(file, "utf8").trim();
  const pid = Number(raw);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function writePid(file, pid) {
  ensureStateDir();
  writeFileSync(file, `${pid}\n`, "utf8");
}

function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function stopPid(pid) {
  if (!isPidAlive(pid)) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch (_) {
    // ignore
  }
}

function getListeningPids(port) {
  try {
    if (process.platform === "win32") {
      const out = execSync(`netstat -ano -p tcp | findstr :${port}`, { stdio: ["ignore", "pipe", "ignore"] }).toString("utf8");
      const pids = out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.split(/\s+/).pop())
        .map((v) => Number(v))
        .filter((v) => Number.isInteger(v) && v > 0);
      return Array.from(new Set(pids));
    }
    const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, { stdio: ["ignore", "pipe", "ignore"] }).toString("utf8");
    const pids = out
      .split(/\r?\n/)
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isInteger(v) && v > 0);
    return Array.from(new Set(pids));
  } catch (_) {
    return [];
  }
}

function stopPids(pids) {
  for (const pid of pids) {
    if (!pid || pid === process.pid) continue;
    try {
      process.kill(pid, "SIGTERM");
    } catch (_) {
      // ignore
    }
  }
}

function checkPortOnHost(port, host) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(700);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

async function isPortOpen(port) {
  if (await checkPortOnHost(port, "127.0.0.1")) return true;
  return checkPortOnHost(port, "::1");
}

async function waitForPort(port, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function spawnDetached(command, args, logFile) {
  ensureStateDir();
  const out = openSync(logFile, "a");
  const child = spawn(command, args, {
    cwd: root,
    env,
    detached: true,
    stdio: ["ignore", out, out],
  });
  child.unref();
  return child.pid;
}

function openBrowser(url) {
  if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  }
}

async function up() {
  let backendPid = readPid(backendPidFile);
  let frontendPid = readPid(frontendPidFile);
  let backendUp = await isPortOpen(3001);
  let frontendUp = await isPortOpen(5174);

  // Nettoie les instances externes/fantômes: port occupé mais PID suivi absent/inactif.
  if (backendUp && (!backendPid || !isPidAlive(backendPid))) {
    stopPids(getListeningPids(3001));
    await new Promise((r) => setTimeout(r, 500));
    backendUp = await isPortOpen(3001);
  }
  if (frontendUp && (!frontendPid || !isPidAlive(frontendPid))) {
    stopPids(getListeningPids(5174));
    await new Promise((r) => setTimeout(r, 500));
    frontendUp = await isPortOpen(5174);
  }

  if (!backendUp) {
    backendPid = spawnDetached(nodeCmd, ["--watch", "backend/src/index.js"], backendLog);
    writePid(backendPidFile, backendPid);
  }
  if (!frontendUp) {
    frontendPid = spawnDetached(npmCmd, ["run", "dev", "--prefix", "frontend"], frontendLog);
    writePid(frontendPidFile, frontendPid);
  }

  const backendReady = await waitForPort(3001, 40000);
  const frontendReady = await waitForPort(5174, 40000);

  const backPidStatus = backendPid
    ? `${backendPid}${isPidAlive(backendPid) ? "" : " (inactif)"}`
    : (backendUp ? "déjà actif (pid externe)" : "n/a");
  const frontPidStatus = frontendPid
    ? `${frontendPid}${isPidAlive(frontendPid) ? "" : " (inactif)"}`
    : (frontendUp ? "déjà actif (pid externe)" : "n/a");
  if (!quiet) {
    console.log(`Backend  : ${backendReady ? "OK" : "KO"} (http://localhost:3001)`);
    console.log(`Frontend : ${frontendReady ? "OK" : "KO"} (http://localhost:5174)`);
    console.log(`PID back : ${backPidStatus}`);
    console.log(`PID front: ${frontPidStatus}`);
  }

  if (frontendReady && !noOpen) {
    openBrowser("http://localhost:5174");
    if (!quiet) console.log("Navigateur ouvert sur http://localhost:5174");
  }
}

async function status() {
  const backendUp = await isPortOpen(3001);
  const frontendUp = await isPortOpen(5174);
  const backendPid = readPid(backendPidFile);
  const frontendPid = readPid(frontendPidFile);
  console.log(`Backend  : ${backendUp ? "UP" : "DOWN"} | pid=${backendPid || "n/a"} | alive=${isPidAlive(backendPid)}`);
  console.log(`Frontend : ${frontendUp ? "UP" : "DOWN"} | pid=${frontendPid || "n/a"} | alive=${isPidAlive(frontendPid)}`);
  console.log(`Logs: ${stateDir}`);
}

async function down() {
  stopPid(readPid(backendPidFile));
  stopPid(readPid(frontendPidFile));
  // Nettoyage complémentaire si des process externes occupent encore les ports.
  stopPids(getListeningPids(3001));
  stopPids(getListeningPids(5174));
  await new Promise((r) => setTimeout(r, 600));
  const backendUp = await isPortOpen(3001);
  const frontendUp = await isPortOpen(5174);
  console.log(`Backend  : ${backendUp ? "encore actif" : "arrêté"}`);
  console.log(`Frontend : ${frontendUp ? "encore actif" : "arrêté"}`);
}

if (mode === "up") {
  await up();
} else if (mode === "status") {
  await status();
} else if (mode === "down" || mode === "stop") {
  await down();
} else {
  console.error("Usage: node scripts/dev-local.mjs [up|status|down]");
  process.exit(1);
}
