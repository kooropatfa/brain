#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--agent") out.agent = argv[++i];
    else if (arg === "--label") out.label = argv[++i];
    else if (arg === "--help" || arg === "-h") out.help = true;
    else {
      console.error("unknown arg: " + arg);
      process.exit(2);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.agent || !args.label) {
  console.log("Usage: claim.mjs --agent <claude|codex|...> --label <display name>");
  process.exit(args.help ? 0 : 2);
}

if (!/^[a-z0-9._-]+$/.test(args.agent)) {
  console.error("agent must use lowercase letters, digits, dot, underscore, or hyphen");
  process.exit(2);
}

const stateDir = path.resolve(process.env.BRAIN_STATE_DIR || path.join(os.homedir(), ".brain"));
const stateFile = path.join(stateDir, "agent-integration.json");

let existing = null;
if (fs.existsSync(stateFile)) {
  try {
    existing = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  } catch (e) {
    console.error(`Brain integration state is not valid JSON: ${stateFile}`);
    console.error(e.message);
    process.exit(1);
  }
}

if (existing?.agent === args.agent) {
  console.log(`Brain already selected for ${args.label}: ${stateFile}`);
  process.exit(0);
}

if (existing?.agent) {
  console.error(`Brain is already installed for '${existing.agent}' on this machine.`);
  console.error(`Refusing to install it for '${args.agent}' as well. Choose one agent integration at a time.`);
  console.error(`To switch intentionally, remove ${stateFile} and uninstall the previous integration first.`);
  process.exit(1);
}

fs.mkdirSync(stateDir, { recursive: true });
const state = {
  agent: args.agent,
  label: args.label,
  installed_at: new Date().toISOString(),
};
fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\n");
console.log(`Brain selected for ${args.label}: ${stateFile}`);
