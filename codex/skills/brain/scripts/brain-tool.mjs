#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function exists(p) {
  return p && fs.existsSync(p);
}

function engineMarker(root) {
  return path.join(root, "tools", "brain-sync", "brain-sync.mjs");
}

function findEngineRoot() {
  const candidates = [];
  if (process.env.BRAIN_ENGINE_ROOT) candidates.push(process.env.BRAIN_ENGINE_ROOT);

  let dir = here;
  for (;;) {
    candidates.push(dir);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  candidates.push(
    path.join(os.homedir(), ".local", "brain-engine"),
    path.join(os.homedir(), "projects", "brain"),
  );

  for (const cand of candidates) {
    const root = path.resolve(cand);
    if (exists(engineMarker(root))) return root;
  }
  return null;
}

const root = findEngineRoot();
if (!root) {
  console.error("brain-tool: cannot find the Brain engine. Set BRAIN_ENGINE_ROOT or run codex/install.sh.");
  process.exit(1);
}

const [tool, ...args] = process.argv.slice(2);
const targets = {
  "brain-sync": path.join(root, "tools", "brain-sync", "brain-sync.mjs"),
  "classifier-context": path.join(root, "tools", "classifier", "context.mjs"),
  "classifier-prompt": path.join(root, "tools", "classifier", "PROMPT.md"),
};

if (!tool || !(tool in targets)) {
  console.error("Usage: brain-tool <brain-sync|classifier-context|classifier-prompt> [args...]");
  process.exit(2);
}

if (tool === "classifier-prompt") {
  process.stdout.write(fs.readFileSync(targets[tool], "utf8"));
  process.exit(0);
}

const child = spawnSync(process.execPath, [targets[tool], ...args], {
  stdio: "inherit",
  env: process.env,
});
process.exit(child.status ?? 1);
