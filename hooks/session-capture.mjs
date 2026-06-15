#!/usr/bin/env node
// session-capture.mjs — the SessionEnd hook that turns a finished Claude Code session into Brain
// food. ONE installed plugin serves N knowledge repos ("brains"). For each bound name (from the
// project's `.brains.yml`) that has `session_capture: on` in its knob stack, the hook distils the
// transcript into a session digest and contributes it via `brain-sync contribute --brain <name>`.
//
// Identity comes from the `.brains.yml` binding (`use: [name1, name2, ...]`), never from
// plugin.json. The capture body runs once per bound name; each name uses its own layered knobs.
//
// Knob layering (later wins, same as session-start-sync.mjs):
//   ~/.config/brain.yml → ~/.config/<name>.yml → project brain.yml → project <name>.yml
//
// OPT-IN: does nothing unless `session_capture: on` is set in the knob stack for a brain name.
// Default OFF because the plugin is installed user-wide and this hook fires in EVERY project,
// including personal ones that have no business feeding a company Brain.
//
// Hard rules (a knowledge hook must never hurt the session it rides on):
//   • ALWAYS exit 0 — failures are logged to stderr and swallowed; shutdown is never blocked.
//   • The inner `claude -p` call is hard-capped (≤90s inside a shared ~290s hook budget) and runs
//     --bare, so it loads no hooks itself — no recursion. The distillation is memoized per model,
//     so N bound brains pay for at most one summarizer call per model.
//   • The digest carries knowledge, not transcripts: no secrets, no big code dumps (enforced by
//     the summarizer prompt; the ingest PR review is the safety net).
//
// Pure Node, zero deps, same conventions as tools/brain-sync/brain-sync.mjs.
//
// Env:
//   SESSION_CAPTURE_DRY=1   write + validate + print the capture, then remove it — no contribute.
//
// Config knobs (<name>.yml layers; see skills/brain/references/configuration.md):
//   session_capture           off (default) | on
//   session_capture_model     haiku (default) — model for the summarizer call
//   session_capture_min_lines 30 (default)   — skip transcripts shorter than this (trivial sessions)

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const log = (m) => console.error("session-capture: " + m);
// bail = the hook's only exit. Exit code 0 ALWAYS — SessionEnd cannot block, and a knowledge hook
// that breaks shutdown teaches people to uninstall it. process.exit skips finally blocks, so any
// held resource (the capture lock) is released via this hook before exiting.
let onBail = null;
const bail = (m) => { if (m) log(m); if (onBail) { try { onBail(); } catch {} } process.exit(0); };
// Safety net for anything outside the per-brain try/catch (pre-loop reads etc.) — a SessionEnd
// hook must NEVER block shutdown, so even an unexpected crash releases the lock and exits 0.
process.on("uncaughtException", (e) => {
  console.error("session-capture: " + ((e && e.message) || e));
  if (onBail) { try { onBail(); } catch {} }
  process.exit(0);
});

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  return { code: r.status ?? 1, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.join(SCRIPT_DIR, "..");

// ---- 1. read the SessionEnd payload from stdin ----
let payload = {};
try {
  payload = JSON.parse(fs.readFileSync(0, "utf8"));
} catch {
  bail("could not parse SessionEnd JSON from stdin");
}
const { session_id: sessionId, transcript_path: transcriptPath, cwd: sessionCwd, reason } = payload;
// `resume` means the session continues elsewhere — capturing now would double-capture later.
if (reason === "resume") bail();
if (!transcriptPath || !fs.existsSync(transcriptPath)) bail("no transcript at " + transcriptPath);

// ---- 2. resolve the effective cwd for walk-ups ----
const effectiveCwd = sessionCwd && fs.existsSync(sessionCwd) ? sessionCwd : process.cwd();

// ---- config layers (scalar-only YAML reading; same approach as brain-sync.mjs) ----
function readScalar(text, key) {
  const m = text.match(new RegExp(`^${key}\\s*:\\s*(.+?)\\s*(?:#.*)?$`, "m"));
  if (!m) return null;
  let v = m[1].trim();
  if (v === "" || v.startsWith("[") || v.startsWith("{")) return null;
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
}
function findUp(filename) {
  let dir = effectiveCwd;
  for (;;) {
    const cand = path.join(dir, filename);
    if (fs.existsSync(cand)) return cand;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
// Layered knobs for ONE brain; later files win. Identity knobs (brain_dir, token_env) are honored
// ONLY from name-specific layers (~/.config/<name>.yml, project <name>.yml) — a generic brain.yml
// setting brain_dir would silently map every bound name onto one clone.
const IDENTITY_KNOBS = ["brain_dir", "token_env"];
function loadKnobs(name) {
  const cfg = { session_capture: "off", session_capture_model: "haiku", session_capture_min_lines: "30", brain_dir: null, token_env: null };
  for (const [file, nameSpecific] of [
    [path.join(os.homedir(), ".config", "brain.yml"), false],
    [path.join(os.homedir(), ".config", name + ".yml"), true],
    [findUp("brain.yml"), false],
    [findUp(name + ".yml"), true],
  ]) {
    if (!file || !fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const key of Object.keys(cfg)) {
      if (!nameSpecific && IDENTITY_KNOBS.includes(key)) continue;
      const v = readScalar(text, key);
      if (v !== null) cfg[key] = v;
    }
  }
  return cfg;
}

// ---- 2b. multi-brain binding gate (.brains.yml; keep in lock-step with session-start-sync.mjs) ----
// Auto-pushing session knowledge into a Brain needs an EXPLICIT binding: a `.brains.yml`
// (`use: [<name>]`) walking up from the session cwd (fallback ~/.config/brains.yml) naming at
// least one Brain. No binding or `use: []` -> bail (nothing to capture).
function readBinding(file) {
  // `use:` as a scalar (`use: personal`) or an inline list (`use: [personal, work]`); `[]`/`none` = no Brain.
  const m = fs.readFileSync(file, "utf8").match(/^use\s*:\s*(.+?)\s*(?:#.*)?$/m);
  if (!m) return null;
  const v = m[1].trim();
  if (v.startsWith("[")) return v.replace(/^\[|\]$/g, "").split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  return v && v !== "none" ? [v.replace(/^["']|["']$/g, "")] : [];
}
let bindingFile = null;
{
  let dir = effectiveCwd;
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
}
const binding = bindingFile ? readBinding(bindingFile) : null;
if (!binding || binding.length === 0) bail("no .brains.yml binding for this project — session_capture needs an explicit Brain binding; skipping");

// ---- locate brain-sync (ships inside this plugin) ----
const brainSync = path.join(PLUGIN_ROOT, "tools", "brain-sync", "brain-sync.mjs");
if (!fs.existsSync(brainSync)) bail("plugin copy is missing brain-sync — reinstall the plugin");

// ---- 3. cheap pre-gate: skip trivial sessions (done once, shared across all bound brains) ----
const transcript = fs.readFileSync(transcriptPath, "utf8");
const lineCount = transcript.split("\n").filter(Boolean).length;

// ---- 4. extract the conversation from the JSONL transcript (done once) ----
// Keep only human-readable user/assistant text — tool calls, results, and metadata are noise the
// summarizer doesn't need (and where secrets are likeliest to lurk). Cap the tail so the prompt
// stays well under argv limits.
const MAX_CHARS = 120_000;
const turns = [];
for (const line of transcript.split("\n")) {
  if (!line.trim()) continue;
  let obj;
  try { obj = JSON.parse(line); } catch { continue; }
  if (obj.type !== "user" && obj.type !== "assistant") continue;
  const content = obj.message?.content;
  let text = "";
  if (typeof content === "string") text = content;
  else if (Array.isArray(content)) {
    text = content.filter((c) => c && c.type === "text" && typeof c.text === "string").map((c) => c.text).join("\n");
  }
  text = text.trim();
  if (text) turns.push(`[${obj.type}]\n${text}`);
}

// ---- 5. per-brain capture loop ----
// Total time budget: hooks.json gives SessionEnd 300s — keep slack and stop looping when spent,
// so one slow brain (or a slow summarizer) cannot make the hook overrun mid-loop.
const DEADLINE = Date.now() + 290_000;

// The transcript is distilled with an IDENTICAL prompt for every brain — memoize per resolved
// model so N bound brains pay for at most one summarizer call per model. Failures and SKIPs are
// memoized too: retrying the same prompt for the next brain would just burn the budget again.
const digests = new Map(); // model -> { digest } | { skip: msg } | { fail: msg }
function distilDigest(model) {
  if (digests.has(model)) return digests.get(model);
  const memo = (r) => { digests.set(model, r); return r; };
  const promptFile = path.join(SCRIPT_DIR, "session-capture-prompt.md");
  if (!fs.existsSync(promptFile)) return memo({ fail: "session-capture-prompt.md missing next to this hook" });
  let conversation = turns.join("\n\n");
  if (conversation.length > MAX_CHARS) conversation = "[…earlier turns truncated…]\n\n" + conversation.slice(-MAX_CHARS);
  const prompt = fs.readFileSync(promptFile, "utf8") + "\n\n---\n\n## The session transcript\n\n" + conversation;
  log(`distilling session ${String(sessionId).slice(0, 8)} (${turns.length} turns) with ${model}`);
  const distil = run("claude", ["-p", prompt, "--bare", "--model", model, "--output-format", "text"],
    { timeout: Math.max(5_000, Math.min(90_000, DEADLINE - Date.now())), env: { ...process.env } });
  if (distil.code !== 0) return memo({ fail: "summarizer failed: " + (distil.err || distil.out).slice(0, 400) });
  const answer = distil.out.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (/^SKIP\b/.test(answer)) return memo({ skip: "nothing durable in this session — SKIP" });
  let digest;
  try { digest = JSON.parse(answer); } catch { return memo({ fail: "summarizer returned neither SKIP nor valid JSON: " + answer.slice(0, 200) }); }
  if (!digest.title || !digest.body) return memo({ fail: "summarizer JSON is missing title/body" });
  return memo({ digest });
}

for (const name of binding) {
  if (Date.now() >= DEADLINE) { log("skipping remaining brains (time budget exhausted)"); break; }
  // One bad brain (unreadable clone, bad config, …) must not kill the others: catch, log one
  // stderr line, move on. The inner try/finally still guarantees the lock release.
  try {
    const cfg = loadKnobs(name);
    if (!["on", "true", "yes"].includes(String(cfg.session_capture).toLowerCase())) continue;
    log(`session_capture is on for '${name}' — checking transcript`);

    const minLines = parseInt(cfg.session_capture_min_lines, 10) || 30;
    if (lineCount < minLines) { log(`transcript has ${lineCount} lines (< ${minLines}) — trivial session, skipping '${name}'`); continue; }
    if (turns.length < 2) { log(`no extractable conversation in transcript — skipping '${name}'`); continue; }

    // ---- sync the Brain clone for this name ----
    const syncEnv = { ...process.env };
    if (cfg.brain_dir) syncEnv.BRAIN_DIR = cfg.brain_dir.replace(/^~(?=\/|\\)/, os.homedir());
    if (cfg.token_env) syncEnv.BRAIN_TOKEN_ENV = cfg.token_env;
    const read = run(process.execPath, [brainSync, "read", "--brain", name], { env: syncEnv });
    if (read.code !== 0) { log(`brain-sync read failed for '${name}' (offline? no token?): ` + (read.err || read.out)); continue; }
    const BRAIN = read.out.split("\n").pop().trim();

    // ---- distil the session (memoized per model; claude -p --bare: no hooks load, no recursion) ----
    const distilled = distilDigest(cfg.session_capture_model);
    if (distilled.skip) { log(`${distilled.skip} — skipping '${name}'`); continue; }
    if (distilled.fail) { log(`for '${name}': ${distilled.fail}`); continue; }
    const digest = distilled.digest;

    // ---- write the capture into the clone's _inbox/ (under a lock — clones are shared) ----
    // Concurrent session ends share ~/.brain; `contribute` stages git add -A, so writes + contribute
    // must not interleave. mkdir is the portable atomic lock; a stale one (>10 min) is stolen.
    const lockDir = path.join(BRAIN, ".git", "session-capture.lock");
    function acquireLock() {
      for (let i = 0; i < 5; i++) {
        try { fs.mkdirSync(lockDir); return true; } catch {}
        try {
          if (Date.now() - fs.statSync(lockDir).mtimeMs > 10 * 60_000) { fs.rmdirSync(lockDir); continue; }
        } catch {}
        spawnSync(process.execPath, ["-e", "setTimeout(()=>{},2000)"], { timeout: 3000 });  // portable 2s sleep
      }
      return false;
    }
    if (!acquireLock()) { log(`could not acquire the capture lock for '${name}' — another session is contributing; skipping`); continue; }
    onBail = () => { try { fs.rmdirSync(lockDir); } catch {} };

    let captureRel = null;
    try {
      // filename: other-YYYY-MM-DD-HHMM.md — the validator allows NO suffix, so collisions bump the minute.
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      let t = new Date(now);
      let file;
      for (;;) {
        file = `other-${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}-${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}.md`;
        if (!fs.existsSync(path.join(BRAIN, "_inbox", file))) break;
        t = new Date(t.getTime() + 60_000);
      }
      captureRel = path.posix.join("_inbox", file);
      const captured = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}T${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}Z`;

      const yq = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;
      const who = run("git", ["-C", effectiveCwd, "config", "user.name"]).out;
      // Valid `hint` dims come from THIS clone's brain.config.yml (each brain defines its own);
      // fall back to the stock set when the config is missing or unreadable.
      let dims = ["technical", "business", "product", "design", "user"];
      try {
        const found = [...fs.readFileSync(path.join(BRAIN, "brain.config.yml"), "utf8").matchAll(/^\s*-\s*name:\s*(\S+)/gm)].map((m) => m[1]);
        if (found.length) dims = found;
      } catch {}
      const fm = [
        "---",
        "source:    other",
        `captured:  ${captured}`,
        `title:     ${yq(digest.title)}`,
        "source_detail: claude-code-session",
        ...(who ? [`participants: [${yq(who)}]`] : []),
        ...(digest.hint && dims.includes(String(digest.hint)) ? [`hint:      ${digest.hint}`] : []),
        ...(Array.isArray(digest.tags) && digest.tags.length
          ? [`tags:      [${digest.tags.slice(0, 6).map((x) => String(x).replace(/[\[\],]/g, "")).join(", ")}]`]
          : []),
        "---",
        "",
      ].join("\n");
      const footer = `\n\n---\n*Auto-captured from a Claude Code session (\`${String(sessionId).slice(0, 8)}\`) in \`${path.basename(effectiveCwd)}\` on ${captured}.*\n`;
      fs.mkdirSync(path.join(BRAIN, "_inbox"), { recursive: true });
      fs.writeFileSync(path.join(BRAIN, captureRel), fm + String(digest.body).trim() + footer);

      // validate against schema v1 — a hook must never push the classifier a malformed capture.
      // The validator ships with the PLUGIN (knowledge clones carry no engine code) and is pointed
      // at the clone via --repo.
      const check = run(process.execPath, [path.join(PLUGIN_ROOT, "tools", "classifier", "context.mjs"), "--repo", BRAIN, "--capture", captureRel]);
      let ok = false;
      try { ok = JSON.parse(check.out).capture.schema_ok; } catch {}
      if (!ok) {
        fs.rmSync(path.join(BRAIN, captureRel), { force: true });
        log(`generated capture for '${name}' failed schema validation — removed it. Validator said: ` + check.out.slice(0, 400));
        continue;
      }

      if (process.env.SESSION_CAPTURE_DRY === "1") {
        log(`DRY RUN — capture for '${name}' written, validated, now removed (no contribute):`);
        console.log(captureRel);
        console.log(fs.readFileSync(path.join(BRAIN, captureRel), "utf8"));
        fs.rmSync(path.join(BRAIN, captureRel), { force: true });
        continue;
      }

      const contrib = run(process.execPath, [brainSync, "contribute", "--brain", name, "--message", `Capture: ${digest.title}`], { env: syncEnv });
      if (contrib.code !== 0) {
        fs.rmSync(path.join(BRAIN, captureRel), { force: true });
        log(`brain-sync contribute failed for '${name}': ` + (contrib.err || contrib.out).slice(0, 400));
        continue;
      }
      log(`contributed session knowledge for '${name}' → ` + contrib.out);
    } finally {
      try { fs.rmdirSync(lockDir); } catch {}
      onBail = null;
    }
  } catch (e) {
    log(`'${name}': ${e.message}`);
  }
}
process.exit(0);
