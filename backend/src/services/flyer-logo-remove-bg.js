/**
 * Détourage logo flyer via **rembg** (https://github.com/danielgatis/rembg) — CLI installée au build (pip).
 * Repli optionnel remove.bg si `REMOVEBG_API_KEY` est défini et que rembg échoue (migration / secours).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

const REMOVE_BG_URL = "https://api.remove.bg/v1.0/removebg";

/**
 * @param {Buffer} input — PNG ou JPEG
 * @returns {Promise<{ ok: true, png: Buffer } | { ok: false, code: string, message?: string }>}
 */
export async function removeLogoBackgroundWithRemoveBg(input) {
  let pngBuf;
  try {
    pngBuf = await sharp(input)
      .rotate()
      .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 6 })
      .toBuffer();
  } catch (e) {
    return { ok: false, code: "IMAGE_DECODE_FAILED", message: String(e?.message || e) };
  }

  const rembg = await removeWithRembgCli(pngBuf);
  if (rembg.ok) return rembg;

  const key = (process.env.REMOVEBG_API_KEY || "").trim();
  if (key.length >= 8) {
    const fallback = await removeWithRemoveBgApi(pngBuf);
    if (fallback.ok) return fallback;
    return {
      ok: false,
      code: "LOGO_BACKGROUND_REMOVAL_FAILED",
      message: [`rembg: ${rembg.message || rembg.code}`, `remove.bg: ${fallback.message || fallback.code}`]
        .join(" — ")
        .slice(0, 900),
    };
  }

  return rembg;
}

/**
 * @param {Buffer} pngBuf — PNG déjà normalisé par sharp
 */
async function removeWithRembgCli(pngBuf) {
  const rembgPath = await resolveRembgExecutable();
  if (!rembgPath) {
    return {
      ok: false,
      code: "REMBG_NOT_INSTALLED",
      message: "CLI rembg introuvable. Build: python3 -m pip install --user \"rembg[cli]\" (voir railway.toml).",
    };
  }

  const pathEnv = [join(homedir(), ".local", "bin"), "/usr/local/bin", process.env.PATH || ""].filter(Boolean).join(":");
  const env = { ...process.env, PATH: pathEnv };

  let workDir;
  try {
    workDir = await mkdtemp(join(tmpdir(), "flyer-rembg-"));
    const inPath = join(workDir, "in.png");
    const outPath = join(workDir, "out.png");
    await writeFile(inPath, pngBuf);

    await execFileAsync(rembgPath, ["i", inPath, outPath], {
      env,
      maxBuffer: 50 * 1024 * 1024,
      timeout: 180_000,
    });

    const out = await readFile(outPath);
    if (!out || out.length < 32) {
      return { ok: false, code: "REMBG_EMPTY_OUTPUT", message: "Sortie rembg trop courte." };
    }
    return { ok: true, png: out };
  } catch (e) {
    const stderr = e?.stderr ? String(e.stderr) : "";
    const stdout = e?.stdout ? String(e.stdout) : "";
    const msg = [stderr, stdout, e?.message].filter(Boolean).join(" | ").slice(0, 900);
    return { ok: false, code: "REMBG_CLI_FAILED", message: msg || String(e) };
  } finally {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function resolveRembgExecutable() {
  const explicit = (process.env.REMBG_COMMAND || "").trim();
  if (explicit) return explicit;

  const candidates = [join(homedir(), ".local", "bin", "rembg"), "rembg"];
  const pathEnv = [join(homedir(), ".local", "bin"), "/usr/local/bin", process.env.PATH || ""].filter(Boolean).join(":");

  for (const cmd of candidates) {
    try {
      await execFileAsync(cmd, ["--help"], {
        env: { ...process.env, PATH: pathEnv },
        timeout: 25_000,
      });
      return cmd;
    } catch {
      /* essai suivant */
    }
  }

  return null;
}

/**
 * Ancien fournisseur payant — uniquement si `REMOVEBG_API_KEY` est présent (secours).
 * @param {Buffer} pngBuf
 */
async function removeWithRemoveBgApi(pngBuf) {
  const key = (process.env.REMOVEBG_API_KEY || "").trim();
  if (!key || key.length < 8) {
    return { ok: false, code: "REMOVEBG_NOT_CONFIGURED" };
  }
  const form = new FormData();
  form.set("image_file", new Blob([new Uint8Array(pngBuf)], { type: "image/png" }), "logo.png");
  form.set("size", "auto");
  const res = await fetch(REMOVE_BG_URL, {
    method: "POST",
    headers: { "X-Api-Key": key },
    body: form,
  });
  if (!res.ok) {
    const t = (await res.text().catch(() => "")).slice(0, 500);
    return {
      ok: false,
      code: "REMOVEBG_HTTP_ERROR",
      message: `status ${res.status} ${t}`,
    };
  }
  const ab = await res.arrayBuffer();
  const out = Buffer.from(ab);
  if (out.length < 32) {
    return { ok: false, code: "REMOVEBG_EMPTY" };
  }
  return { ok: true, png: out };
}
