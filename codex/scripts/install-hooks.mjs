#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--engine-root") out.engineRoot = argv[++i];
  }
  return out;
}

function quoteForCommand(value) {
  return `"${String(value).replace(/(["\\$`])/g, "\\$1")}"`;
}

const args = parseArgs(process.argv.slice(2));
const engineRoot = path.resolve(args.engineRoot || process.env.BRAIN_ENGINE_ROOT || path.join(os.homedir(), ".local", "brain-engine"));
const codexHome = path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"));
const hooksFile = path.join(codexHome, "hooks.json");
const hookScript = path.join(engineRoot, "codex", "hooks", "session-start-sync.mjs");

if (!fs.existsSync(hookScript)) {
  console.error("install-hooks: missing " + hookScript);
  process.exit(1);
}

let config = { hooks: {} };
if (fs.existsSync(hooksFile)) {
  try {
    config = JSON.parse(fs.readFileSync(hooksFile, "utf8"));
  } catch (e) {
    console.error("install-hooks: cannot parse " + hooksFile + ": " + e.message);
    process.exit(1);
  }
}
if (!config || typeof config !== "object" || Array.isArray(config)) config = { hooks: {} };
if (!config.hooks || typeof config.hooks !== "object" || Array.isArray(config.hooks)) config.hooks = {};
if (!Array.isArray(config.hooks.SessionStart)) config.hooks.SessionStart = [];

const command = `node ${quoteForCommand(hookScript)}`;
const alreadyInstalled = JSON.stringify(config.hooks.SessionStart).includes("codex/hooks/session-start-sync.mjs");
if (!alreadyInstalled) {
  config.hooks.SessionStart.push({
    hooks: [
      {
        type: "command",
        command,
      },
    ],
  });
}

fs.mkdirSync(codexHome, { recursive: true });
fs.writeFileSync(hooksFile, JSON.stringify(config, null, 2) + "\n");
console.log(hooksFile);
