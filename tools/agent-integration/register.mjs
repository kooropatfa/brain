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

function usage() {
  console.log("Usage: register.mjs --agent <claude|codex|...> --label <display name>");
}

function assertRegistryShape(registry, stateFile) {
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    throw new Error(`Brain integration registry must be a JSON object: ${stateFile}`);
  }
  if (registry.integrations === undefined) registry.integrations = {};
  if (
    !registry.integrations ||
    typeof registry.integrations !== "object" ||
    Array.isArray(registry.integrations)
  ) {
    throw new Error(`Brain integration registry must contain an integrations object: ${stateFile}`);
  }
}

function readRegistry(stateFile) {
  if (!fs.existsSync(stateFile)) return { integrations: {} };
  try {
    const registry = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    assertRegistryShape(registry, stateFile);
    return registry;
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error(`Brain integration registry is not valid JSON: ${stateFile}\n${e.message}`);
    }
    throw e;
  }
}

function installedEntries(registry) {
  return Object.entries(registry.integrations)
    .filter(([, value]) => value && value.status === "installed")
    .sort(([a], [b]) => a.localeCompare(b));
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.agent || !args.label) {
  usage();
  process.exit(args.help ? 0 : 2);
}

if (!/^[a-z0-9._-]+$/.test(args.agent)) {
  console.error("agent must use lowercase letters, digits, dot, underscore, or hyphen");
  process.exit(2);
}

const stateDir = path.resolve(process.env.BRAIN_STATE_DIR || path.join(os.homedir(), ".brain"));
const stateFile = path.join(stateDir, "agent-integrations.json");

let registry;
try {
  registry = readRegistry(stateFile);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const now = new Date().toISOString();
const existingAgent = registry.integrations[args.agent];
for (const [agent, integration] of installedEntries(registry)) {
  if (agent !== args.agent) {
    console.log(`${integration.label || agent} already installed.`);
  }
}

registry.integrations[args.agent] = {
  ...(existingAgent && typeof existingAgent === "object" ? existingAgent : {}),
  label: args.label,
  installed_at:
    existingAgent && typeof existingAgent === "object" && typeof existingAgent.installed_at === "string"
      ? existingAgent.installed_at
      : now,
  status: "installed",
};

if (existingAgent) {
  registry.integrations[args.agent].refreshed_at = now;
  console.log(`${args.label} already installed, refreshing.`);
} else {
  console.log(`${args.label} registered.`);
}

try {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(registry, null, 2) + "\n");
} catch (e) {
  console.error(`Could not write Brain integration registry: ${stateFile}`);
  console.error(e.message);
  process.exit(1);
}

const labels = installedEntries(registry).map(([agent, integration]) => integration.label || agent);
console.log(`Registered Brain agent integrations: ${labels.join(", ")}`);
console.log(`Registry: ${stateFile}`);
