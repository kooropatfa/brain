#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function findEngineRoot() {
  if (process.env.BRAIN_ENGINE_ROOT) return path.resolve(process.env.BRAIN_ENGINE_ROOT);
  let dir = here;
  for (;;) {
    if (fs.existsSync(path.join(dir, "tools", "brain-sync", "brain-sync.mjs"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const root = findEngineRoot();
if (!root) {
  console.error("codex-session-start-sync: cannot find Brain engine root");
  process.exit(0);
}

const hook = path.join(root, "hooks", "session-start-sync.mjs");
if (!fs.existsSync(hook)) {
  console.error("codex-session-start-sync: missing engine hook " + hook);
  process.exit(0);
}

const run = spawnSync(process.execPath, [hook], {
  stdio: "inherit",
  env: { ...process.env, CLAUDE_PLUGIN_ROOT: root, BRAIN_ENGINE_ROOT: root },
});
process.exit(run.status ?? 0);
