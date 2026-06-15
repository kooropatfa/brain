#!/usr/bin/env node
// inbox-watch.mjs — the Dropbox feel for the Brain. Watches a plain local folder; anything you
// drop in it gets moved into the Brain clone's _inbox/, FORMATTED LOCALLY into a schema-v1
// capture (the ENGINE's tools/normalizer/normalize-drops.mjs --worktree: text embedded, binaries
// parked in _attachments/), and pushed to the default branch, where the ingestion Action
// classifies and files it. No Obsidian needed, no git knowledge needed — drag a file into a
// folder, the Brain assimilates it. If local formatting ever fails, the raw file is pushed anyway
// and the Action's own normalizer (range mode) formats it as the backstop.
//
// Cross-platform by construction: pure Node (macOS + Windows + Linux), zero deps, and a polling
// scan instead of fs.watch (which is unreliable/inconsistent across platforms). A file is only
// picked up when STABLE — same size + mtime across two consecutive scans — so half-copied files
// are never pushed. Per-OS service install (launchd / systemd / Task Scheduler): see README.md.
//
//   Usage:  node tools/inbox-watch/inbox-watch.mjs [--brain <clone-dir>] [--drop <folder>]
//                                                  [--engine <brain-engine-dir>]
//                                                  [--interval <seconds>] [--once]
//   Defaults: --brain  $BRAIN_DIR, else the single clone under ~/.brain
//             --drop   $DROP_DIR,  else the clone's own _inbox/ (watch-in-place)
//             --interval 30
//   --once: one scan + push, then exit (for testing and for cron-style schedulers).
//
// ENGINE RESOLUTION — the normalizer lives in the ENGINE, not in the knowledge clone. After the
// engine/knowledge split, knowledge clones (~/.brain/<name>) carry NO tools/, so the normalizer
// must be located in the engine (plugin or engine checkout). This tool also runs headless, as a
// background service (launchd/systemd/Task Scheduler) with no Claude/plugin env, so the resolver
// tries, in order, and the first existing path wins:
//   1. $CLAUDE_PLUGIN_ROOT/tools/normalizer/normalize-drops.mjs  (set when run under the plugin)
//   2. --engine <dir> / $BRAIN_ENGINE  →  <dir>/tools/normalizer/normalize-drops.mjs  (explicit
//      override, e.g. baked into a service unit)
//   3. an installed plugin auto-discovered by scanning
//        ~/.claude/plugins/cache/*/*/*/tools/normalizer/normalize-drops.mjs   and
//        ~/.claude/plugins/marketplaces/*/tools/normalizer/normalize-drops.mjs
//      (newest by mtime if several) — how a background service finds it with no env
//   4. backstop: this file's own sibling — tools/inbox-watch/ is next to tools/normalizer/ IN THE
//      ENGINE, so <dir-of-inbox-watch.mjs>/../normalizer/normalize-drops.mjs (works when
//      inbox-watch runs straight from the engine checkout/plugin)
// If none exist it dies listing the paths tried; pass --engine <brain-engine-dir>, set
// $BRAIN_ENGINE, or install the brain plugin. The --brain path stays the knowledge CLONE — it is
// never conflated with the engine; only the normalizer SCRIPT PATH is engine-based.
//
// Auth: token from the env var named by `token_env:` in the clone's brain.config.yml (default
// GH_TOKEN), falling back to `gh auth token`. Injected into the remote URL only for the push,
// then scrubbed — same pattern as brain-sync.mjs. Never written to disk.
//
// Safety rules:
//   • never hard-resets or force-pushes; a diverged clone logs a warning and skips the cycle
//   • files >50MB are skipped (warned once) — the Brain is a knowledge vault, not blob storage
//   • dotfiles, temp/partial files (~$x.docx, *.part, *.crdownload, *.tmp) are ignored

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));   // dir of this inbox-watch.mjs

const log = (m) => console.error(`inbox-watch[${new Date().toISOString()}]: ${m}`);
const die = (m) => { log(m); process.exit(1); };

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  return { code: r.status ?? 1, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}
const git = (args, cwd) => run("git", args.length && args[0] !== "-C" ? ["-C", cwd, ...args] : args, {});

// ---- args ----
const argv = process.argv.slice(2);
const opt = { interval: 30 };
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--brain") opt.brain = argv[++i];
  else if (argv[i] === "--drop") opt.drop = argv[++i];
  else if (argv[i] === "--engine") opt.engine = argv[++i];
  else if (argv[i] === "--interval") opt.interval = parseInt(argv[++i], 10) || 30;
  else if (argv[i] === "--once") opt.once = true;
  else if (argv[i] === "--help" || argv[i] === "-h") {
    console.log("Usage: inbox-watch [--brain <clone>] [--drop <folder>] [--engine <brain-engine-dir>] [--interval <s>] [--once]");
    process.exit(0);
  } else die("unknown arg: " + argv[i]);
}

// ---- resolve the Brain clone ----
function resolveBrain() {
  if (opt.brain) return path.resolve(opt.brain);
  if (process.env.BRAIN_DIR) return path.resolve(process.env.BRAIN_DIR);
  const root = path.join(os.homedir(), ".brain");
  if (fs.existsSync(root)) {
    const clones = fs.readdirSync(root).filter((d) => fs.existsSync(path.join(root, d, ".git")));
    if (clones.length === 1) return path.join(root, clones[0]);
    if (clones.length > 1) die(`several clones under ${root} (${clones.join(", ")}) — pick one with --brain`);
  }
  die("no Brain clone found — run 'brain-sync read' once, or pass --brain <clone-dir>");
}
const BRAIN = resolveBrain();
if (!fs.existsSync(path.join(BRAIN, ".git"))) die(`${BRAIN} is not a git clone`);
if (!fs.existsSync(path.join(BRAIN, "_inbox"))) die(`${BRAIN} has no _inbox/ — not a Brain clone?`);

// ---- resolve the ENGINE normalizer (NOT in the knowledge clone — see header) ----
// Glob a fixed-depth pattern of literal "*" segments under a root, returning matching files.
// e.g. globFixed(cacheRoot, ["*", "*", "*", "tools", "normalizer", "normalize-drops.mjs"]).
function globFixed(root, segs) {
  let dirs = [root];
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const last = i === segs.length - 1;
    const next = [];
    for (const d of dirs) {
      if (seg === "*") {
        let entries;
        try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
        for (const e of entries) { if (e.isDirectory()) next.push(path.join(d, e.name)); }
      } else {
        const cand = path.join(d, seg);
        try {
          const st = fs.statSync(cand);
          if (last ? st.isFile() : st.isDirectory()) next.push(cand);
        } catch { /* missing */ }
      }
    }
    dirs = next;
  }
  return dirs;
}

function resolveNormalizer() {
  const tried = [];
  const rel = ["tools", "normalizer", "normalize-drops.mjs"];
  const tryFile = (p) => { tried.push(p); return fs.existsSync(p) ? p : null; };

  // 1. plugin root (set when invoked under the plugin)
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    const hit = tryFile(path.join(process.env.CLAUDE_PLUGIN_ROOT, ...rel));
    if (hit) return { path: hit, via: "$CLAUDE_PLUGIN_ROOT" };
  }
  // 2. explicit --engine / $BRAIN_ENGINE override
  const engineDir = opt.engine || process.env.BRAIN_ENGINE;
  if (engineDir) {
    const hit = tryFile(path.join(path.resolve(engineDir), ...rel));
    if (hit) return { path: hit, via: opt.engine ? "--engine" : "$BRAIN_ENGINE" };
  }
  // 3. auto-discover an installed plugin (newest by mtime if several)
  const pluginsRoot = path.join(os.homedir(), ".claude", "plugins");
  const candidates = [
    // cache/<marketplace>/<plugin>/<version>/tools/normalizer/normalize-drops.mjs
    ...globFixed(path.join(pluginsRoot, "cache"), ["*", "*", "*", ...rel]),
    // marketplaces/<name>/tools/normalizer/normalize-drops.mjs
    ...globFixed(path.join(pluginsRoot, "marketplaces"), ["*", ...rel]),
  ];
  if (candidates.length) {
    const newest = candidates
      .map((p) => { try { return { p, m: fs.statSync(p).mtimeMs }; } catch { return null; } })
      .filter(Boolean)
      .sort((a, b) => b.m - a.m)[0];
    if (newest) { tried.push(`${pluginsRoot}/{cache,marketplaces}/**/${rel.join("/")}`); return { path: newest.p, via: "installed plugin (auto-discovered)" }; }
  }
  // 4. backstop: this file's sibling normalizer in the engine checkout/plugin
  const sibling = tryFile(path.join(HERE, "..", "normalizer", "normalize-drops.mjs"));
  if (sibling) return { path: sibling, via: "sibling (engine checkout)" };

  die(
    "cannot locate the engine normalizer (normalize-drops.mjs) — knowledge clones carry no tools/.\n" +
    "  tried:\n" + tried.map((p) => `    - ${p}`).join("\n") + "\n" +
    "  fix: set --engine <brain-engine-dir> or $BRAIN_ENGINE, or install the brain plugin."
  );
}
const NORMALIZER = resolveNormalizer();
log(`normalizer: ${NORMALIZER.path} (via ${NORMALIZER.via})`);

// shared facts from the clone's own brain.config.yml (scalar-only read, like brain-sync)
function readScalar(text, key) {
  const m = text.match(new RegExp(`^${key}\\s*:\\s*(.+?)\\s*(?:#.*)?$`, "m"));
  if (!m) return null;
  let v = m[1].trim();
  if (v === "" || v.startsWith("[") || v.startsWith("{")) return null;
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
}
const cfgText = fs.existsSync(path.join(BRAIN, "brain.config.yml")) ? fs.readFileSync(path.join(BRAIN, "brain.config.yml"), "utf8") : "";
const REPO = readScalar(cfgText, "repo");
const BRANCH = readScalar(cfgText, "default_branch") || "main";
const TOKEN_ENV = process.env.BRAIN_TOKEN_ENV || readScalar(cfgText, "token_env") || "GH_TOKEN";
if (!REPO) die(`${BRAIN}/brain.config.yml has no 'repo:' — cannot push`);

const DROP = path.resolve(opt.drop || process.env.DROP_DIR || path.join(BRAIN, "_inbox"));
fs.mkdirSync(DROP, { recursive: true });
const watchInPlace = path.resolve(DROP) === path.resolve(path.join(BRAIN, "_inbox"));
log(`watching ${DROP}${watchInPlace ? " (the clone's _inbox itself)" : ` → ${path.join(BRAIN, "_inbox")}`} every ${opt.interval}s; pushing to ${REPO}@${BRANCH}`);

function resolveToken() {
  if (process.env[TOKEN_ENV]) return process.env[TOKEN_ENV];
  const r = run("gh", ["auth", "token"]);
  return r.code === 0 ? r.out : "";
}
const authedRemote = (token) => token
  ? `https://x-access-token:${token}@github.com/${REPO}.git`
  : `https://github.com/${REPO}.git`;

// ---- scanning ----
const MAX_BYTES = 50 * 1024 * 1024;
const IGNORE = new Set(["README.md", "_TEMPLATE.md", ".gitkeep"]);
const TEMP_RE = /^~\$|\.(tmp|part|crdownload|download|swp)$/i;
const warned = new Set();          // oversized files we already complained about
let lastSeen = new Map();          // path -> "size:mtime" from the previous scan, for stability

function scanDropDir() {
  const stable = [];
  const seen = new Map();
  for (const name of fs.readdirSync(DROP)) {
    if (name.startsWith(".") || IGNORE.has(name) || TEMP_RE.test(name)) continue;
    const full = path.join(DROP, name);
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    if (!st.isFile()) continue;
    if (st.size > MAX_BYTES) {
      if (!warned.has(full)) { warned.add(full); log(`SKIP ${name}: ${(st.size / 1024 / 1024).toFixed(0)}MB > 50MB — the Brain is not blob storage`); }
      continue;
    }
    const sig = `${st.size}:${st.mtimeMs}`;
    seen.set(full, sig);
    // In-place mode: only NEW (untracked) files matter; moved-in files are always new.
    if (watchInPlace) {
      const rel = path.posix.join("_inbox", name);
      const tracked = git(["ls-files", "--error-unmatch", rel], BRAIN).code === 0;
      if (tracked) continue;
    }
    if (lastSeen.get(full) === sig) stable.push(full);   // unchanged across two scans = stable
  }
  lastSeen = seen;
  return stable;
}

function cycle() {
  const stable = scanDropDir();
  if (!stable.length) return;

  // bring the clone current first; never fight a diverged clone
  const pull = git(["pull", "--ff-only", "origin", BRANCH], BRAIN);
  if (pull.code !== 0) { log(`pull --ff-only failed (diverged clone? offline?) — skipping this cycle: ${pull.err}`); return; }

  const moved = [];
  for (const full of stable) {
    let base = path.basename(full);
    if (!watchInPlace) {
      let dest = path.join(BRAIN, "_inbox", base);
      if (fs.existsSync(dest)) {
        const ext = path.extname(base);
        base = `${path.basename(base, ext)}-${Date.now().toString(36)}${ext}`;
        dest = path.join(BRAIN, "_inbox", base);
      }
      try { fs.renameSync(full, dest); }
      catch { fs.copyFileSync(full, dest); fs.rmSync(full); }   // cross-device fallback
    }
    moved.push(base);
  }
  if (!moved.length) return;

  // FORMAT LOCALLY before anything is pushed: turn raw drops into schema-v1 captures right here
  // (text embedded, binaries → _attachments/), so what lands on the branch is already the shape
  // the pipeline speaks. If this fails for any reason, push raw — the ingestion Action runs the
  // same normalizer in range mode as the backstop, nothing is ever lost.
  let normalized = 0;
  const norm = run("node", [NORMALIZER.path, "--worktree", "--repo", BRAIN]);
  if (norm.code === 0) {
    try {
      const report = JSON.parse(norm.out);
      normalized = report.count;
      for (const u of report.unclear) log(`unclear drop ${u.file} — the ingest PR will be routed to a human (needs-human) and ask: ${u.question}`);
    } catch { log("could not parse normalizer report — pushing raw, the Action will format"); }
  } else {
    log("local normalization failed — pushing raw, the Action will format: " + (norm.err || norm.out).slice(0, 200));
  }

  if (!git(["config", "user.email"], BRAIN).out) git(["config", "user.email", "inbox-watch@agents.local"], BRAIN);
  if (!git(["config", "user.name"], BRAIN).out) git(["config", "user.name", "inbox-watch"], BRAIN);
  // normalization rewrites/moves files, so stage the affected folders, not just the moved names
  const add = git(["add", "-A", "--", "_inbox", ...(fs.existsSync(path.join(BRAIN, "_attachments")) ? ["_attachments"] : [])], BRAIN);
  if (add.code !== 0) { log("git add failed: " + add.err); return; }
  const title = `Drop: ${moved.slice(0, 3).join(", ")}${moved.length > 3 ? ` (+${moved.length - 3} more)` : ""}${normalized ? " (normalized)" : ""}`;
  const ci = git(["commit", "-m", title], BRAIN);
  if (ci.code !== 0) { log("commit failed (nothing staged?): " + (ci.err || ci.out)); return; }

  const token = resolveToken();
  if (!token) { log(`no token in $${TOKEN_ENV} and 'gh auth token' empty — committed locally, will push next cycle`); return; }
  const restore = git(["remote", "get-url", "origin"], BRAIN).out || `https://github.com/${REPO}.git`;
  git(["remote", "set-url", "origin", authedRemote(token)], BRAIN);
  const push = git(["push", "origin", `HEAD:${BRANCH}`], BRAIN);
  git(["remote", "set-url", "origin", restore], BRAIN);
  if (push.code !== 0) { log("push failed: " + push.err); return; }
  log(`pushed ${moved.length} drop(s): ${moved.join(", ")} — ingestion will take it from here`);
}

if (opt.once) {
  // two scans so the stability check can pass on a quiet folder
  scanDropDir();
  cycle();
  process.exit(0);
}
cycle();
setInterval(cycle, opt.interval * 1000);
