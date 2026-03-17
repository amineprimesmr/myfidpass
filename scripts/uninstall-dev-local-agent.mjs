#!/usr/bin/env node
import { execSync } from "child_process";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";

const uid = process.getuid?.();
if (!uid) process.exit(1);

const label = "fr.myfidpass.devlocal";
const plistPath = join(process.env.HOME || "", "Library", "LaunchAgents", `${label}.plist`);

try {
  execSync(`launchctl bootout gui/${uid}/${label}`, { stdio: "inherit" });
} catch (_) {
  // ignore
}

if (existsSync(plistPath)) unlinkSync(plistPath);
console.log(`LaunchAgent supprimé: ${label}`);
