#!/usr/bin/env node
// session-start-sync.mjs — the SessionStart hook that makes Brain greetings DETERMINISTIC.
// ONE installed plugin serves N knowledge repos ("brains"). Identity comes from the project's
// `.brains.yml` binding (`use: [name1, name2, ...]`), never from plugin.json. For each bound
// name the hook calls `brain-sync read --brain <name>` to sync the clone under ~/.brain/<name>
// and prints one status line per brain — which Claude Code adds to session context so both the
// user and the model see the Brain is there before any prompt is typed.
//
// Knob layering (later wins):
//   ~/.config/brain.yml → ~/.config/<name>.yml → project brain.yml → project <name>.yml
//   preflight   quiet (default) → print the one line; off → print nothing; verbose → line + detail
//   auto_pull   true (default)  → clone-or-pull; false → just report the existing clone, no network
//   brain_dir / token_env       → forwarded to brain-sync (honored ONLY from name-specific layers)
//
// Hard rules: ALWAYS exit 0, never block the session (per-brain pull capped at 45s inside a shared
// ~110s total budget; on any failure print the degraded line and move on). Pure Node, zero deps —
// same conventions as session-capture.mjs.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const logErr = (m) => console.error("session-start-sync: " + m);
// Safety net for anything outside the per-brain try/catch (pre-loop reads etc.) — a SessionStart
// hook must NEVER block the session, so even an unexpected crash exits 0.
process.on("uncaughtException", (e) => { console.error("session-start-sync: " + ((e && e.message) || e)); process.exit(0); });
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.join(SCRIPT_DIR, "..");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  return { code: r.status ?? 1, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

// ---- payload (only cwd matters here; absence of stdin must not break anything) ----
let cwd = process.cwd();
try {
  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  if (payload.cwd && fs.existsSync(payload.cwd)) cwd = payload.cwd;
} catch {}

// ---- config layers (scalar-only read, same approach as session-capture.mjs) ----
function readScalar(text, key) {
  const m = text.match(new RegExp(`^${key}\\s*:\\s*(.+?)\\s*(?:#.*)?$`, "m"));
  if (!m) return null;
  let v = m[1].trim();
  if (v === "" || v.startsWith("[") || v.startsWith("{")) return null;
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
}
function findUp(filename) {
  let dir = cwd;
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
  const cfg = { preflight: "quiet", auto_pull: "true", brain_dir: null, token_env: null };
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

// ---- multi-brain binding (.brains.yml; keep in lock-step with session-capture.mjs + brain-sync) ----
// A machine can host several Brains (one plugin, N knowledge repos). Each project declares which
// Brain(s) it uses in a `.brains.yml` at its root (`use: [<name>]`), found by walking up from cwd;
// `~/.config/brains.yml` is the machine-wide fallback. No binding anywhere -> announce the choice,
// instruct the agent to ask the user, and do NOT sync. `use: []` -> no Brain here, exit silently.
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
  let dir = cwd;
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
if (binding && binding.length === 0) process.exit(0);   // 'use: []' — explicitly no Brain here
if (!binding) {
  const brainsRoot = path.join(os.homedir(), ".brain");
  const clones = fs.existsSync(brainsRoot)
    ? fs.readdirSync(brainsRoot).filter((d) => fs.existsSync(path.join(brainsRoot, d, "brain.config.yml")))
    : [];
  if (clones.length)
    console.log(`🧠 Brain: no .brains.yml binding in this project. Brains on this machine: ${clones.sort().join(", ")}. ASK the user which Brain (if any) this project should use, then save the answer as '.brains.yml' at the project root ('use: [<name>]') — or keep it session-only if they prefer. Until bound: do not read from or contribute to any Brain.`);
  process.exit(0);
}

const brainSync = path.join(PLUGIN_ROOT, "tools", "brain-sync", "brain-sync.mjs");
if (!fs.existsSync(brainSync)) {
  logErr("plugin copy is missing brain-sync — reinstall the plugin");
  process.exit(0);
}

// Total time budget: hooks.json gives SessionStart 120s — keep slack and shrink each brain's pull
// window to whatever remains, so one slow brain cannot eat the whole hook mid-loop.
const DEADLINE = Date.now() + 110_000;
for (const name of binding) {
  if (Date.now() >= DEADLINE) { logErr("skipping remaining brains (time budget exhausted)"); break; }
  // One bad brain (directory named brain.yml, missing clone, …) must not kill the others:
  // catch, log one stderr line, move on.
  try {
    const cfg = loadKnobs(name);
    const say = (line, detail) => {
      if (cfg.preflight === "off") return;
      console.log(line);
      if (cfg.preflight === "verbose" && detail) console.log(detail);
    };
    const env = { ...process.env };
    if (cfg.brain_dir) env.BRAIN_DIR = cfg.brain_dir.replace(/^~(?=\/|\\)/, os.homedir());
    if (cfg.token_env) env.BRAIN_TOKEN_ENV = cfg.token_env;

    const brainPath = run(process.execPath, [brainSync, "path", "--brain", name], { env }).out;
    const cloneExists = brainPath && fs.existsSync(path.join(brainPath, ".git"));
    if (!cloneExists) {
      say(`🧠 Brain '${name}': bound but not connected on this machine — run: node "${brainSync}" connect --repo <owner>/${name}`);
      continue;
    }
    if (!["true", "yes", "on"].includes(String(cfg.auto_pull).toLowerCase())) {
      say(`🧠 Brain available (auto_pull off, may be stale): ${brainPath} — '${name}' bound via .brains.yml.`);
      continue;
    }
    const read = run(process.execPath, [brainSync, "read", "--brain", name],
      { env, timeout: Math.max(5_000, Math.min(45_000, DEADLINE - Date.now())) });
    if (read.code === 0) {
      say(`🧠 Brain synced: ${read.out.split("\n").pop().trim()} — '${name}' bound to this project; consult it before non-trivial work.`, read.err);
    } else {
      say(`🧠 Brain '${name}': sync failed (offline? diverged? no token?) — using the last-pulled copy at ${brainPath}.`, (read.err || read.out).slice(0, 300));
      logErr(`read failed for '${name}': ` + (read.err || read.out).slice(0, 300));
    }
  } catch (e) {
    logErr(`'${name}': ${e.message}`);
  }
}
process.exit(0);
