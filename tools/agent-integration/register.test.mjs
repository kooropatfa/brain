import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "register.mjs");

function tempStateDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "brain-agent-integrations-"));
}

function runRegister(stateDir, args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: path.dirname(script),
    env: { ...process.env, BRAIN_STATE_DIR: stateDir },
    encoding: "utf8",
  });
}

function readRegistry(stateDir) {
  return JSON.parse(fs.readFileSync(path.join(stateDir, "agent-integrations.json"), "utf8"));
}

test("register creates a multi-agent registry from empty state", () => {
  const stateDir = tempStateDir();
  const result = runRegister(stateDir, ["--agent", "claude", "--label", "Claude Code"]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Claude Code registered\./);

  const registry = readRegistry(stateDir);
  assert.deepEqual(Object.keys(registry.integrations), ["claude"]);
  assert.equal(registry.integrations.claude.label, "Claude Code");
  assert.equal(registry.integrations.claude.status, "installed");
  assert.match(registry.integrations.claude.installed_at, /^\d{4}-\d{2}-\d{2}T/);
});

test("register refreshes an existing agent without duplicating it", () => {
  const stateDir = tempStateDir();
  assert.equal(runRegister(stateDir, ["--agent", "claude", "--label", "Claude Code"]).status, 0);
  const first = readRegistry(stateDir).integrations.claude.installed_at;

  const result = runRegister(stateDir, ["--agent", "claude", "--label", "Claude Code"]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Claude Code already installed, refreshing\./);

  const registry = readRegistry(stateDir);
  assert.deepEqual(Object.keys(registry.integrations), ["claude"]);
  assert.equal(registry.integrations.claude.installed_at, first);
  assert.match(registry.integrations.claude.refreshed_at, /^\d{4}-\d{2}-\d{2}T/);
});

test("register adds a different agent without blocking existing integrations", () => {
  const stateDir = tempStateDir();
  assert.equal(runRegister(stateDir, ["--agent", "claude", "--label", "Claude Code"]).status, 0);

  const result = runRegister(stateDir, ["--agent", "codex", "--label", "Codex"]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Claude Code already installed\./);
  assert.match(result.stdout, /Codex registered\./);
  assert.match(result.stdout, /Registered Brain agent integrations: Claude Code, Codex/);

  const registry = readRegistry(stateDir);
  assert.deepEqual(Object.keys(registry.integrations).sort(), ["claude", "codex"]);
  assert.equal(registry.integrations.claude.status, "installed");
  assert.equal(registry.integrations.codex.status, "installed");
});

test("register fails clearly when the registry JSON is invalid", () => {
  const stateDir = tempStateDir();
  fs.writeFileSync(path.join(stateDir, "agent-integrations.json"), "{not json\n");

  const result = runRegister(stateDir, ["--agent", "claude", "--label", "Claude Code"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Brain integration registry is not valid JSON/);
});
