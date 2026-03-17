#!/usr/bin/env node
import { execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const root = process.cwd();
const uid = process.getuid?.();
if (!uid) {
  console.error("Impossible de déterminer l'UID utilisateur.");
  process.exit(1);
}

const label = "fr.myfidpass.devlocal";
const launchAgentsDir = join(process.env.HOME || "", "Library", "LaunchAgents");
const plistPath = join(launchAgentsDir, `${label}.plist`);
const node22 = "/opt/homebrew/opt/node@22/bin/node";
const nodeBin = existsSync(node22) ? node22 : "node";
const scriptPath = join(root, "scripts", "start-all.mjs");
const logDir = join(root, ".dev-local");
const outLog = join(logDir, "launchd.out.log");
const errLog = join(logDir, "launchd.err.log");

if (!existsSync(launchAgentsDir)) mkdirSync(launchAgentsDir, { recursive: true });
if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodeBin}</string>
    <string>${scriptPath}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${root}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${outLog}</string>
  <key>StandardErrorPath</key>
  <string>${errLog}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>
`;

writeFileSync(plistPath, plist, "utf8");

function sh(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

try {
  sh(`launchctl bootout gui/${uid}/${label}`);
} catch (_) {
  // ignore if not loaded yet
}

sh(`launchctl bootstrap gui/${uid} "${plistPath}"`);
sh(`launchctl kickstart -k gui/${uid}/${label}`);

console.log(`LaunchAgent installé et activé: ${label}`);
console.log(`Plist: ${plistPath}`);
