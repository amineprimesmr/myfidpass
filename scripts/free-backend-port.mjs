#!/usr/bin/env node
/**
 * Libère le port du backend (défaut 3001) en envoyant SIGTERM aux processus en écoute.
 * Évite le cas : vieux Node sur 3001 + nouveau backend sur 3002 + Vite qui proxy toujours vers 3001.
 */
import { execSync } from "child_process";
import { pathToFileURL } from "url";

const DEFAULT_PORT = 3001;

function getListeningPids(port) {
  try {
    if (process.platform === "win32") {
      const out = execSync(`netstat -ano -p tcp | findstr :${port}`, {
        stdio: ["ignore", "pipe", "ignore"],
      }).toString("utf8");
      const pids = out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.split(/\s+/).pop())
        .map((v) => Number(v))
        .filter((v) => Number.isInteger(v) && v > 0);
      return [...new Set(pids)];
    }
    const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, {
      stdio: ["ignore", "pipe", "ignore"],
    }).toString("utf8");
    return [
      ...new Set(
        out
          .split(/\r?\n/)
          .map((v) => Number(v.trim()))
          .filter((v) => Number.isInteger(v) && v > 0),
      ),
    ];
  } catch {
    return [];
  }
}

/**
 * @param {number} [port]
 * @returns {number[]} PIDs signalés
 */
export function freeBackendPort(port = DEFAULT_PORT) {
  const p = Number(port) || DEFAULT_PORT;
  const pids = getListeningPids(p).filter((pid) => pid !== process.pid);
  if (pids.length === 0) {
    console.log(`[dev] Port ${p} libre.`);
    return [];
  }
  console.log(`[dev] Port ${p} occupé par PID ${pids.join(", ")} — arrêt (SIGTERM) pour éviter un vieux backend fantôme.`);
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // ignore
    }
  }
  return pids;
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const port = Number(process.argv[2]) || Number(process.env.PORT) || DEFAULT_PORT;
  freeBackendPort(port);
}
