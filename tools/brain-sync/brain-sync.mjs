#!/usr/bin/env node
// brain-sync.mjs — the agent↔Brain connection. A portable, dependency-free helper that plugs into
// ANY agent session in ANY project and lets that agent (a) READ the Brain by cloning-or-pulling the
// Brain repo into a known local path, and (b) CONTRIBUTE by branching + committing a local edit and
// opening a PR against the Brain repo. It targets whatever Brain `brain.config.yml` names, so it is
// reusable across projects — never hardcoded to one Brain.
//
// Pure Node (macOS + Linux + Windows): no npm deps, no jq, no bash. Shells out to `git` and `gh`.
//
// Commands:
//   connect     first-clone a knowledge repo onto this machine.
//                 --repo <owner/name>              (required)
//                 --brain <name>                   (optional; overrides default name = repo basename)
//   read        clone-or-pull the Brain repo into the known local path (idempotent). Prints the path.
//   contribute  branch + commit local edits in the Brain clone + push + open a PR. Prints the PR URL.
//                 --message "<commit/PR title>"   (required)
//                 --branch  "<branch name>"        (optional; default brain-sync/<slug>-<short>)
//                 --body    "<PR body>"            (optional)
//                 --base    "<base branch>"        (optional; default = config default_branch)
//                 --dry-run                         (do everything except push + open PR)
//   path        print the resolved local Brain path and exit (no network).
//   config      print the resolved config (repo, default_branch, token_env, brain_dir) and exit.
//
// Brain addressing (two modes):
//   --brain <name>  address a Brain by its clone under ~/.brain/<name>. The clone's OWN
//                   brain.config.yml names the remote. No project-level config needed.
//                   `path --brain <name>` works even before the clone exists (pure local computation).
//   (fallback)      walk UP from $PWD looking for brain.config.yml (legacy single-Brain behaviour).
//
// Config discovery (fallback, so it works from an arbitrary directory):
//   1. --config <file>             explicit path
//   2. $BRAIN_CONFIG               env override
//   3. brain.config.yml found by walking UP from $PWD to the filesystem root
// Only the top-level SCALAR keys `repo:` and `default_branch:` are read (a deliberately scalar-only
// reader — it never parses YAML arrays/blocks, sidestepping the inline-array pitfall noted in the hub
// escalation; see README). `repo:` (owner/name) is required.
//
// Known local path (the "read" destination): $BRAIN_DIR, else ~/.brain/<name> (where name = repo-basename
// in fallback mode, or the explicit --brain value in --brain mode).
//
// Auth: a token read from env — var name is configurable (`token_env:` in config, or $BRAIN_TOKEN_ENV),
// default GH_TOKEN. If that var is empty, falls back to `gh auth token`. The token is used for BOTH
// git-over-HTTPS push and `gh` (gh reads GH_TOKEN natively). Never printed, never written to disk.
//
// Atomic commit attribution: one focused commit per contribution, with a configurable co-author
// trailer so Claude, Codex, and future agents can identify themselves truthfully.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_TRAILER = "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>";
const die = (m) => { console.error("brain-sync: " + m); process.exit(1); };
const log = (m) => console.error("brain-sync: " + m);   // status to stderr; stdout reserved for results

// Shared brain-name validator. Rejects empty strings, path traversal (".", ".."), slashes, and
// any character outside the safe set — so ~/.brain/<name> can never escape ~/.brain/.
const validBrainName = (n) => /^[A-Za-z0-9._-]+$/.test(n) && n !== "." && n !== "..";

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  return { code: r.status ?? 1, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}
const git = (args, cwd, env) => run("git", args, { cwd, env: env ? { ...process.env, ...env } : process.env });

// ---- args ----
const argv = process.argv.slice(2);
const command = argv[0];
const opt = {};
for (let i = 1; i < argv.length; i++) {
  const k = argv[i];
  if (k === "--config") opt.config = argv[++i];
  else if (k === "--message" || k === "-m") opt.message = argv[++i];
  else if (k === "--branch") opt.branch = argv[++i];
  else if (k === "--body") opt.body = argv[++i];
  else if (k === "--base") opt.base = argv[++i];
  else if (k === "--dry-run") opt.dryRun = true;
  else if (k === "--force-unbound") opt.forceUnbound = true;
  else if (k === "--brain") opt.brain = argv[++i];
  else if (k === "--repo") opt.repo = argv[++i];
  else die("unknown arg: " + k);
}
// Guard: flag-like or missing values indicate the user forgot to supply the argument.
if ("brain" in opt && (!opt.brain || opt.brain.startsWith("-"))) die("--brain needs a value");
if ("repo" in opt && (!opt.repo || opt.repo.startsWith("-"))) die("--repo needs a value");
if (!command || ["-h", "--help", "help"].includes(command)) {
  console.log(`brain-sync — agent↔Brain connection
Usage:
  brain-sync connect --repo <owner/name> [--brain <name>]
  brain-sync read    [--brain <name>]
  brain-sync contribute --message "<title>" [--brain <name>] [--branch <name>] [--body <text>] [--base <branch>] [--dry-run] [--force-unbound]
  brain-sync path    [--brain <name>]
  brain-sync config  [--brain <name>]
Flags:
  --brain <name>   address a Brain by its clone under ~/.brain/<name> (no project config needed)
  --repo  <owner/name>  required for connect
Env: BRAIN_CONFIG, BRAIN_DIR, BRAIN_TOKEN_ENV (default GH_TOKEN). Reads repo from brain.config.yml.`);
  process.exit(command ? 0 : 2);
}

// ---- config discovery + scalar-only read ----
function findConfig() {
  if (opt.config) return path.resolve(opt.config);
  if (process.env.BRAIN_CONFIG) return path.resolve(process.env.BRAIN_CONFIG);
  let dir = process.cwd();
  for (;;) {
    const cand = path.join(dir, "brain.config.yml");
    if (fs.existsSync(cand)) return cand;
    const parent = path.dirname(dir);
    if (parent === dir) break;       // hit filesystem root
    dir = parent;
  }
  die("no brain.config.yml found (searched up from cwd). Set --config or $BRAIN_CONFIG.");
}

// Read ONE top-level scalar by key. Deliberately handles scalars only — ignores list/block values so
// we never mis-handle an array (the inline-array bug the hub escalation flagged lives in a different,
// array-parsing tool; we avoid the whole class by reading only the scalars we need).
function readScalar(text, key) {
  const re = new RegExp(`^${key}\\s*:\\s*(.+?)\\s*(?:#.*)?$`, "m");
  const m = text.match(re);
  if (!m) return null;
  let v = m[1].trim();
  if (v === "" || v === "[" || v.startsWith("[") || v.startsWith("{")) return null;  // not a scalar
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
}

function loadConfig() {
  // --brain <name>: address a Brain by its clone under ~/.brain/<name>. The clone's OWN
  // brain.config.yml names the remote; `path` needs no config at all (pure local computation).
  if (opt.brain) {
    if (!validBrainName(opt.brain)) die(`invalid brain name: ${opt.brain}`);
    const brainDir = process.env.BRAIN_DIR
      ? path.resolve(process.env.BRAIN_DIR)
      : path.join(os.homedir(), ".brain", opt.brain);
    const file = path.join(brainDir, "brain.config.yml");
    if (command === "path")
      return { file, repo: null, defaultBranch: "main", tokenEnv: "GH_TOKEN", brainDir, repoBase: opt.brain };
    if (!fs.existsSync(file))
      die(`no Brain named '${opt.brain}' on this machine (expected ${file}). Run: brain-sync connect --repo <owner/name>`);
    const text = fs.readFileSync(file, "utf8");
    const repo = readScalar(text, "repo");
    if (!repo || !/^[^/\s]+\/[^/\s]+$/.test(repo))
      die(`${file} must set 'repo: owner/name' (got: ${repo ?? "missing"})`);
    const defaultBranch = readScalar(text, "default_branch") || "main";
    const tokenEnv = process.env.BRAIN_TOKEN_ENV || readScalar(text, "token_env") || "GH_TOKEN";
    return { file, repo, defaultBranch, tokenEnv, brainDir, repoBase: opt.brain };
  }
  // fallback: walk up from cwd (legacy single-Brain behaviour)
  const file = findConfig();
  const text = fs.readFileSync(file, "utf8");
  const repo = readScalar(text, "repo");
  if (!repo || !/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    die(`brain.config.yml (${file}) must set 'repo: owner/name' (got: ${repo ?? "missing"})`);
  }
  const defaultBranch = readScalar(text, "default_branch") || "main";
  const tokenEnv = process.env.BRAIN_TOKEN_ENV || readScalar(text, "token_env") || "GH_TOKEN";
  const repoBase = repo.split("/")[1];
  if (!validBrainName(repoBase)) die(`brain.config.yml (${file}) repo basename '${repoBase}' is not a valid brain name`);
  const brainDir = process.env.BRAIN_DIR
    ? path.resolve(process.env.BRAIN_DIR)
    : path.join(os.homedir(), ".brain", repoBase);
  return { file, repo, defaultBranch, tokenEnv, brainDir, repoBase };
}

// Resolve the auth token: configured env var first, then `gh auth token`. Returns "" if none.
function resolveToken(tokenEnv) {
  if (process.env[tokenEnv]) return process.env[tokenEnv];
  const r = run("gh", ["auth", "token"]);
  return r.code === 0 ? r.out : "";
}

function authedRemote(repo, token) {
  // x-access-token is the GitHub convention for a token-as-password over HTTPS.
  return token
    ? `https://x-access-token:${token}@github.com/${repo}.git`
    : `https://github.com/${repo}.git`;
}

// ---- command: connect (first clone of a knowledge repo onto this machine) ----
if (command === "connect") {
  if (!opt.repo || !/^[^/\s]+\/[^/\s]+$/.test(opt.repo)) die('connect needs --repo "<owner/name>"');
  const name = opt.brain || opt.repo.split("/")[1];
  if (!validBrainName(name)) die(`invalid brain name: ${name}`);
  const dir = process.env.BRAIN_DIR
    ? path.resolve(process.env.BRAIN_DIR)
    : path.join(os.homedir(), ".brain", name);
  if (fs.existsSync(path.join(dir, ".git"))) {
    // Verify the existing clone actually tracks the requested repo.
    const expectedUrl = `https://github.com/${opt.repo}.git`;
    const actualUrl = git(["remote", "get-url", "origin"], dir).out;
    const normalise = (u) => u.replace(/\.git$/, "");
    if (actualUrl && normalise(actualUrl) !== normalise(expectedUrl)) {
      die(`${dir} is a clone of ${actualUrl}, not ${opt.repo} — refusing to report it as connected`);
    }
    log(`already connected: ${dir}`); console.log(dir); process.exit(0);
  }
  if (fs.existsSync(dir) && fs.readdirSync(dir).length)
    die(`${dir} exists and is not a Brain clone — refusing to overwrite`);
  const tokenEnv = process.env.BRAIN_TOKEN_ENV || "GH_TOKEN";
  const token = resolveToken(tokenEnv);
  const redact = (s) => (token ? String(s).split(token).join("***") : String(s));
  log(`cloning ${opt.repo} into ${dir}`);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const clone = git(["clone", authedRemote(opt.repo, token), dir]);
  if (clone.code !== 0) die(redact(`clone failed: ${clone.err || clone.out}`));
  git(["remote", "set-url", "origin", `https://github.com/${opt.repo}.git`], dir);   // scrub token
  if (!fs.existsSync(path.join(dir, "brain.config.yml")))
    log(`warning: ${opt.repo} contains no brain.config.yml — is it really a Brain knowledge repo?`);
  console.log(dir);
  process.exit(0);
}

const cfg = loadConfig();

// ---- command: config / path (no network) ----
if (command === "config") {
  const token = resolveToken(cfg.tokenEnv);
  console.log(JSON.stringify({
    config_file: cfg.file, repo: cfg.repo, default_branch: cfg.defaultBranch,
    token_env: cfg.tokenEnv, token_present: Boolean(token), brain_dir: cfg.brainDir,
  }, null, 2));
  process.exit(0);
}
if (command === "path") { console.log(cfg.brainDir); process.exit(0); }

// ---- command: read (clone-or-pull) ----
if (command === "read") {
  const token = resolveToken(cfg.tokenEnv);
  const redact = (s) => (token ? String(s).split(token).join("***") : String(s));
  const gitInside = fs.existsSync(path.join(cfg.brainDir, ".git"));
  if (gitInside) {
    log(`pulling ${cfg.repo} into ${cfg.brainDir}`);
    // Auth rides on the command line (never written to .git/config). Self-heal clones where an
    // older crashed run left a tokened URL persisted in origin (the old set-url dance could).
    const cur = git(["remote", "get-url", "origin"], cfg.brainDir).out;
    if (/x-access-token/.test(cur)) git(["remote", "set-url", "origin", `https://github.com/${cfg.repo}.git`], cfg.brainDir);
    const ck = git(["checkout", cfg.defaultBranch], cfg.brainDir);
    if (ck.code !== 0) log(`note: could not checkout ${cfg.defaultBranch}: ${ck.err}`);
    const pull = git(["pull", "--ff-only", authedRemote(cfg.repo, token), cfg.defaultBranch], cfg.brainDir);
    if (pull.code !== 0) die(redact(`pull failed: ${pull.err || pull.out}`));
  } else {
    if (fs.existsSync(cfg.brainDir) && fs.readdirSync(cfg.brainDir).length)
      die(`${cfg.brainDir} exists and is not a Brain clone — refusing to overwrite`);
    log(`cloning ${cfg.repo} into ${cfg.brainDir}`);
    fs.mkdirSync(path.dirname(cfg.brainDir), { recursive: true });
    const clone = git(["clone", authedRemote(cfg.repo, token), cfg.brainDir]);
    if (clone.code !== 0) die(redact(`clone failed: ${clone.err || clone.out}`));
    // scrub token from the persisted remote URL
    git(["remote", "set-url", "origin", `https://github.com/${cfg.repo}.git`], cfg.brainDir);
  }
  console.log(cfg.brainDir);   // stdout = the known local path, for scripting
  process.exit(0);
}

// ---- command: contribute (branch + commit + push + PR) ----
if (command === "contribute") {
  if (!opt.message) die("contribute needs --message \"<title>\"");

  // multi-brain binding guard (.brains.yml; keep in lock-step with hooks/session-start-sync.mjs):
  // a project that declares its Brain(s) — `use: [<repo-basenames>]` in a `.brains.yml` found by
  // walking up from cwd (fallback ~/.config/brains.yml) — only contributes to a Brain it binds.
  // No binding file -> allowed (single-brain machines need zero ceremony).
  if (!opt.forceUnbound) {
    let bindingFile = null;
    let dir = process.cwd();
    for (;;) {
      const cand = path.join(dir, ".brains.yml");
      if (fs.existsSync(cand)) { bindingFile = cand; break; }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    if (!bindingFile) {
      const home = path.join(os.homedir(), ".config", "brains.yml");
      if (fs.existsSync(home)) bindingFile = home;
    }
    if (bindingFile) {
      const m = fs.readFileSync(bindingFile, "utf8").match(/^use\s*:\s*(.+?)\s*(?:#.*)?$/m);
      const v = m ? m[1].trim() : null;
      const names = v == null ? null
        : v.startsWith("[") ? v.replace(/^\[|\]$/g, "").split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean)
        : (v && v !== "none" ? [v.replace(/^["']|["']$/g, "")] : []);
      if (names && !names.includes(cfg.repoBase)) {
        die(`this project is bound to [${names.join(", ")}] via ${bindingFile}, not to '${cfg.repoBase}' — refusing to contribute to the wrong Brain (--force-unbound overrides, only on the user's explicit say-so)`);
      }
    }
  }
  if (!fs.existsSync(path.join(cfg.brainDir, ".git")))
    die(`no Brain clone at ${cfg.brainDir} — run 'brain-sync read' first, then edit files there`);

  const status = git(["status", "--porcelain"], cfg.brainDir);
  if (status.code !== 0) die(`git status failed: ${status.err}`);
  if (!status.out) die(`no local changes in ${cfg.brainDir} — edit the Brain, then contribute`);
  log("changes to contribute:\n" + status.out);

  const base = opt.base || cfg.defaultBranch;
  const slug = opt.message.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  // deterministic-ish short suffix from the staged diff so repeated runs don't collide on the same name
  const diffHash = run("git", ["-C", cfg.brainDir, "diff", "--stat"]).out;
  const short = Buffer.from(diffHash + slug).toString("hex").slice(0, 6);
  const branch = opt.branch || `brain-sync/${slug || "contribution"}-${short}`;

  // ensure a commit identity exists (portable default; respects any already-configured identity)
  if (!git(["config", "user.email"], cfg.brainDir).out)
    git(["config", "user.email", "brain-sync@agents.local"], cfg.brainDir);
  if (!git(["config", "user.name"], cfg.brainDir).out)
    git(["config", "user.name", "brain-sync agent"], cfg.brainDir);

  // branch off a fresh base
  const token = resolveToken(cfg.tokenEnv);
  if (!token && !opt.dryRun) die(`no token in $${cfg.tokenEnv} and 'gh auth token' empty — cannot push`);
  const co = git(["checkout", "-b", branch], cfg.brainDir);
  if (co.code !== 0) die(`could not create branch ${branch}: ${co.err}`);

  // stage ALL local changes — in a dedicated Brain clone every uncommitted change IS this
  // contribution (this is not a shared worktree; nobody else's work lives here).
  const add = git(["add", "-A"], cfg.brainDir);
  if (add.code !== 0) die(`git add failed: ${add.err}`);
  const trailer = process.env.BRAIN_AGENT_TRAILER ?? DEFAULT_TRAILER;
  const commitArgs = trailer.trim()
    ? ["commit", "-m", opt.message, "-m", trailer.trim()]
    : ["commit", "-m", opt.message];
  const ci = git(commitArgs, cfg.brainDir);
  if (ci.code !== 0) die(`commit failed: ${ci.err || ci.out}`);
  log(`committed on ${branch}`);

  if (opt.dryRun) {
    log("--dry-run: skipping push + PR. Created local branch:");
    console.log(branch);
    process.exit(0);
  }

  // push with the token on the command line — never persisted into .git/config
  const redact = (s) => (token ? String(s).split(token).join("***") : String(s));
  const push = git(["push", authedRemote(cfg.repo, token), `${branch}:${branch}`], cfg.brainDir);
  if (push.code !== 0) die(redact(`push failed: ${push.err || push.out}`));
  log(`pushed ${branch}`);

  // open the PR via gh, feeding it the token through GH_TOKEN
  const pr = run("gh", [
    "pr", "create", "--repo", cfg.repo, "--base", base, "--head", branch,
    "--title", opt.message, "--body", opt.body || opt.message,
  ], { cwd: cfg.brainDir, env: { ...process.env, GH_TOKEN: token } });
  if (pr.code !== 0) die(`gh pr create failed: ${pr.err || pr.out}`);
  const url = (pr.out.match(/https?:\/\/\S+/) || [pr.out])[0];
  console.log(url);   // stdout = the PR URL
  process.exit(0);
}

die(`unknown command: ${command} (try: read | contribute | connect | path | config | help)`);
