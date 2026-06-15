// tools/brain-sync/brain-sync.test.mjs — run: node --test tools/brain-sync/*.test.mjs
// Network-free: only `path`, `config` and arg-validation paths are exercised.
// Tests are POSIX-only (fake $HOME via env); the tool itself is cross-platform.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BIN = new URL("./brain-sync.mjs", import.meta.url).pathname;

function fakeHome(brains = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "brain-test-"));
  for (const [name, repo] of Object.entries(brains)) {
    const dir = path.join(home, ".brain", name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "brain.config.yml"),
      `repo: ${repo}\ndefault_branch: main\n`);
  }
  return home;
}
const sync = (args, home) => spawnSync("node", [BIN, ...args], {
  encoding: "utf8", cwd: home,
  env: { ...process.env, HOME: home, BRAIN_CONFIG: "", BRAIN_DIR: "" },
});

test("path --brain prints ~/.brain/<name> with no project config anywhere", () => {
  const home = fakeHome();
  const r = sync(["path", "--brain", "mybrain"], home);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), path.join(home, ".brain", "mybrain"));
});

test("config --brain reads repo from the clone's own brain.config.yml", () => {
  const home = fakeHome({ mybrain: "you/mybrain" });
  const r = sync(["config", "--brain", "mybrain"], home);
  assert.equal(r.status, 0, r.stderr);
  const cfg = JSON.parse(r.stdout);
  assert.equal(cfg.repo, "you/mybrain");
  assert.equal(cfg.brain_dir, path.join(home, ".brain", "mybrain"));
});

test("config --brain for an unknown brain dies with a connect hint", () => {
  const home = fakeHome();
  const r = sync(["config", "--brain", "ghost"], home);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /connect --repo/);
});

test("connect requires --repo owner/name", () => {
  const home = fakeHome();
  const r = sync(["connect"], home);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--repo/);
});

test("connect onto an existing clone is a no-op that prints the path", () => {
  const home = fakeHome({ mybrain: "you/mybrain" });
  const dir = path.join(home, ".brain", "mybrain");
  fs.mkdirSync(path.join(dir, ".git"), { recursive: true });   // fake clone marker
  const r = sync(["connect", "--repo", "you/mybrain"], home);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), dir);
});

// --- fix 1 & 2: brain-name validation ---

test("read --brain ../x rejects traversal name", () => {
  const home = fakeHome();
  const r = sync(["read", "--brain", "../x"], home);
  assert.equal(r.status, 1, "expected exit 1");
  assert.match(r.stderr, /invalid brain name/);
});

test("path --brain .. rejects dot-dot name", () => {
  const home = fakeHome();
  const r = sync(["path", "--brain", ".."], home);
  assert.equal(r.status, 1, "expected exit 1");
  assert.match(r.stderr, /invalid brain name/);
});

test("connect --repo owner/.. rejects dot-dot as derived brain name", () => {
  const home = fakeHome();
  const r = sync(["connect", "--repo", "owner/.."], home);
  assert.equal(r.status, 1, "expected exit 1");
  assert.match(r.stderr, /invalid brain name/);
});

// --- fix 4: connect onto an existing clone of a DIFFERENT repo ---

test("connect refuses to report an existing clone of a different repo as connected", () => {
  const home = fakeHome();
  const dir = path.join(home, ".brain", "mybrain");
  fs.mkdirSync(dir, { recursive: true });
  // Initialise a real (local) git repo and set its origin to you/mybrain
  const init = spawnSync("git", ["init", dir], { encoding: "utf8" });
  if (init.status !== 0) { /* skip if git unavailable in sandbox */ return; }
  spawnSync("git", ["remote", "add", "origin", "https://github.com/you/mybrain.git"], { encoding: "utf8", cwd: dir });
  // Asking to connect other/mybrain over the you/mybrain clone must fail
  const r = sync(["connect", "--repo", "other/mybrain"], home);
  assert.equal(r.status, 1, "expected exit 1 when remotes mismatch");
  assert.match(r.stderr, /refusing/);
});

test("connect accepts an existing clone whose remote matches --repo", () => {
  const home = fakeHome();
  const dir = path.join(home, ".brain", "mybrain");
  fs.mkdirSync(dir, { recursive: true });
  const init = spawnSync("git", ["init", dir], { encoding: "utf8" });
  if (init.status !== 0) { /* skip if git unavailable */ return; }
  spawnSync("git", ["remote", "add", "origin", "https://github.com/you/mybrain.git"], { encoding: "utf8", cwd: dir });
  const r = sync(["connect", "--repo", "you/mybrain"], home);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.trim().endsWith("mybrain"), `expected path ending in mybrain, got: ${r.stdout.trim()}`);
});

test("config legacy walk-up rejects dot-dot repo basename from brain.config.yml", () => {
  const home = fakeHome();
  // write a brain.config.yml with a dot-dot repo basename into a temp project dir (NOT under ~/.brain)
  const projectDir = path.join(home, "projects", "myproject");
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, "brain.config.yml"), "repo: owner/..\ndefault_branch: main\n");
  const r = spawnSync("node", [BIN, "config"], {
    encoding: "utf8", cwd: projectDir,
    env: { ...process.env, HOME: home, BRAIN_CONFIG: "", BRAIN_DIR: "" },
  });
  assert.equal(r.status, 1, "expected exit 1 for dot-dot repo basename");
  assert.match(r.stderr, /not a valid brain name/);
});
