#!/usr/bin/env node
// context.mjs — the deterministic half of the classifier. It does NOT classify; it removes every
// excuse for the headless Claude classifier to guess. Given a capture file in _inbox/, it:
//   1. reads the dimension set from brain.config.yml (NEVER hardcoded — config_driven quirk),
//   2. parses the capture's frontmatter against m2's _inbox schema v1 and flags violations,
//   3. resolves the concrete on-disk filing targets (dimension folders, decisions/, glossary),
//   4. emits a single JSON "context pack" the Action injects into the classifier prompt.
//
// Pure Node, zero deps (the repo has no repo-wide install; a 5-field YAML head doesn't justify a
// dependency). The YAML reader here is intentionally minimal — it handles exactly the shapes
// brain.config.yml and the _inbox frontmatter use (scalars, inline [a, b] lists, and the
// `dimensions:`/`infra_folders:` block lists), and refuses anything it can't parse rather than
// guessing. If the config grows past that, swap in a real YAML lib here.
//
//   Usage:  node context.mjs --capture _inbox/<file>.md [--repo <root>]
//           node context.mjs --repo <root>            # config + targets only, no capture
//   Output: JSON on stdout. Non-zero exit only on unreadable repo/config (a malformed capture is
//           reported IN the JSON as schema_violations, not a crash — the Action still wants the pack).

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// ---------- args ----------
const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--capture") opt.capture = argv[++i];
  else if (argv[i] === "--repo") opt.repo = argv[++i];
  else if (argv[i] === "--help" || argv[i] === "-h") opt.help = true;
}
if (opt.help) {
  process.stdout.write("Usage: node context.mjs --capture _inbox/<file>.md [--repo <root>]\n");
  process.exit(0);
}
const REPO = path.resolve(opt.repo || process.cwd());
const die = (m) => { process.stderr.write(`context.mjs: ${m}\n`); process.exit(1); };

// ---------- minimal YAML (only the shapes our two files use) ----------
// Splits the leading `---\n...\n---` frontmatter block from the body. Returns { fm, body }.
export function splitFrontmatter(text) {
  // tolerate a leading BOM / blank lines
  const t = text.replace(/^﻿/, "");
  const m = t.match(/^\s*---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: null, body: t };
  return { fm: m[1], body: m[2] ?? "" };
}

function stripComment(line) {
  // remove a trailing ` # comment`, but not a `#` inside quotes
  let inS = false, inD = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === "#" && !inS && !inD && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

function unquote(v) {
  v = v.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

function parseInlineList(v) {
  // [a, "b c", 'd'] -> ["a","b c","d"]; respects quotes so commas inside quotes are safe
  const inner = v.slice(1, -1);
  const out = [];
  let cur = "", inS = false, inD = false;
  for (const c of inner) {
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === "," && !inS && !inD) { out.push(unquote(cur)); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim() !== "") out.push(unquote(cur));
  return out;
}

// Parse a flat-ish YAML mapping. Supports: `key: scalar`, `key: [inline, list]`, `key:` followed by
// `  - item` block lists, and one level of `- name: x` / `blurb: y` records (for `dimensions:`).
export function parseYaml(src) {
  const lines = src.split(/\r?\n/);
  const root = {};
  let i = 0;
  while (i < lines.length) {
    let raw = stripComment(lines[i]);
    if (raw.trim() === "") { i++; continue; }
    const indent = raw.length - raw.trimStart().length;
    if (indent !== 0) { i++; continue; } // only top-level keys handled at this layer
    const line = raw.trim();
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) { i++; continue; }
    const key = kv[1];
    const rest = kv[2].trim();
    if (rest === "") {
      // block: either a list of `- ...` or `- key: val` records, or nested scalars
      const block = [];
      let j = i + 1;
      while (j < lines.length) {
        const bRaw = stripComment(lines[j]);
        if (bRaw.trim() === "") { j++; continue; }
        const bIndent = bRaw.length - bRaw.trimStart().length;
        if (bIndent === 0) break;
        block.push({ indent: bIndent, text: bRaw.trim(), raw: bRaw });
        j++;
      }
      root[key] = parseBlock(block);
      i = j;
    } else if (rest.startsWith("[")) {
      root[key] = parseInlineList(rest);
      i++;
    } else {
      root[key] = unquote(rest);
      i++;
    }
  }
  return root;
}

function parseBlock(block) {
  if (block.length === 0) return [];
  // record list?  `- name: technical` then `  blurb: ...`
  const isRecordList = block.some((b) => /^- \s*[A-Za-z0-9_]+:/.test(b.text));
  const isScalarList = block.every((b) => b.text.startsWith("- "));
  if (isRecordList) {
    const records = [];
    let cur = null;
    for (const b of block) {
      const startsRecord = b.text.startsWith("- ");
      const text = startsRecord ? b.text.slice(2).trim() : b.text;
      const kv = text.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      if (startsRecord) { cur = {}; records.push(cur); }
      if (kv && cur) cur[kv[1]] = unquote(kv[2].trim());
    }
    return records;
  }
  if (isScalarList) {
    return block.map((b) => unquote(b.text.slice(2).trim()));
  }
  // fallback: nested scalar map
  const obj = {};
  for (const b of block) {
    const kv = b.text.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (kv) obj[kv[1]] = unquote(kv[2].trim());
  }
  return obj;
}

// ---------- read config ----------
export function readConfig() {
  const cfgPath = path.join(REPO, "brain.config.yml");
  if (!fs.existsSync(cfgPath)) die(`brain.config.yml not found at ${cfgPath} — is --repo the Brain root?`);
  const cfg = parseYaml(fs.readFileSync(cfgPath, "utf8"));
  const dimensions = Array.isArray(cfg.dimensions) ? cfg.dimensions : [];
  if (dimensions.length === 0) die("brain.config.yml has no dimensions[] — cannot classify against an empty set");
  return {
    company: cfg.company || null,
    repo: cfg.repo || null,
    default_branch: cfg.default_branch || "main",
    dimensions: dimensions.map((d) => ({ name: d.name, blurb: d.blurb || "" })),
    infra_folders: Array.isArray(cfg.infra_folders) ? cfg.infra_folders : ["_inbox", "decisions"],
    glossary_note: cfg.glossary_note || "ubiquitous-language",
  };
}

// ---------- resolve filing targets on disk ----------
export function resolveTargets(cfg) {
  const dimensionTargets = cfg.dimensions.map((d) => {
    const folder = d.name;
    const exists = fs.existsSync(path.join(REPO, folder));
    const moc = ["index.md", `${folder}.md`, "_index.md", "MOC.md"].find((f) =>
      fs.existsSync(path.join(REPO, folder, f))
    ) || null;
    return { dimension: d.name, blurb: d.blurb, folder, exists, moc_note: moc ? `${folder}/${moc}` : null };
  });
  const decisionsFolder = cfg.infra_folders.find((f) => /decision/i.test(f)) || "decisions";
  const glossaryFile = ["", ".md"].map((ext) => `${cfg.glossary_note}${ext}`)
    .find((f) => fs.existsSync(path.join(REPO, f))) || `${cfg.glossary_note}.md`;
  return {
    dimensions: dimensionTargets,
    decisions: { folder: decisionsFolder, exists: fs.existsSync(path.join(REPO, decisionsFolder)) },
    glossary: { note: glossaryFile, exists: fs.existsSync(path.join(REPO, glossaryFile)) },
    inbox: { folder: "_inbox", exists: fs.existsSync(path.join(REPO, "_inbox")) },
  };
}

// ---------- parse + validate a capture against m2's schema v1 ----------
const SOURCE_ENUM = ["manual", "meet", "slack", "email", "other"];
const SOURCE_SPECIFIC = { participants: ["meet", "slack", "email"], channel: ["slack", "email"], file: ["meet"] };

function isEmpty(v) {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

function validateCapture(captureRel) {
  const capPath = path.join(REPO, captureRel);
  if (!fs.existsSync(capPath)) die(`capture not found: ${capPath}`);
  const text = fs.readFileSync(capPath, "utf8");
  const { fm, body } = splitFrontmatter(text);
  const violations = [];
  let frontmatter = {};
  if (fm === null) {
    violations.push("no frontmatter block (expected leading --- ... ---)");
  } else {
    frontmatter = parseYaml(fm);
  }

  // required: source, captured, title
  for (const req of ["source", "captured", "title"]) {
    if (isEmpty(frontmatter[req])) violations.push(`required field \`${req}\` is missing or empty`);
  }
  if (frontmatter.source && !SOURCE_ENUM.includes(frontmatter.source)) {
    violations.push(`\`source\` "${frontmatter.source}" not in enum ${JSON.stringify(SOURCE_ENUM)}`);
  }
  if (frontmatter.source === "other" && isEmpty(frontmatter.source_detail)) {
    violations.push("`source: other` requires `source_detail`");
  }
  if (frontmatter.captured && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/.test(String(frontmatter.captured))) {
    violations.push(`\`captured\` "${frontmatter.captured}" is not ISO-8601 UTC (YYYY-MM-DDTHH:MM[:SS]Z)`);
  }
  // filename convention: <source>-<YYYY-MM-DD-HHMM>.md
  const base = path.basename(captureRel);
  if (!/^[a-z]+-\d{4}-\d{2}-\d{2}-\d{4}\.md$/.test(base)) {
    violations.push(`filename "${base}" doesn't match <source>-<YYYY-MM-DD-HHMM>.md`);
  } else if (frontmatter.source && !base.startsWith(`${frontmatter.source}-`)) {
    violations.push(`filename prefix doesn't match \`source: ${frontmatter.source}\``);
  }

  // source-specific fields present-only-when-truthful: presence/absence is signal, not error.
  const presentSourceSpecific = {};
  for (const [field, sources] of Object.entries(SOURCE_SPECIFIC)) {
    presentSourceSpecific[field] = {
      present: !isEmpty(frontmatter[field]),
      expected_for_source: sources.includes(frontmatter.source),
      value: frontmatter[field] ?? null,
    };
  }

  return {
    path: captureRel,
    filename: base,
    frontmatter,
    body_raw: body.trimEnd(),
    body_chars: body.trim().length,
    hint: isEmpty(frontmatter.hint) ? null : frontmatter.hint,
    source_specific: presentSourceSpecific,
    schema_version: 1,
    schema_violations: violations,
    schema_ok: violations.length === 0,
  };
}

// ---------- assemble (only when run directly, not when imported) ----------
// The helpers above (splitFrontmatter, parseYaml, readConfig, resolveTargets) are exported so the
// ingestion reviewer (tools/reviewer/validate-ingest.mjs, m7) can reuse this file's YAML parser +
// config reader instead of duplicating them. This block must NOT run on import — guard it so only
// `node context.mjs ...` executes it. tools/classifier/test.mjs spawns this as a subprocess, so the
// guard doesn't affect it.
// Use pathToFileURL(argv[1]) — NOT `file://${argv[1]}` — so the guard matches even when argv[1]
// goes through a symlink (e.g. macOS /tmp -> /private/tmp) or a `.engine/` CI checkout, where the
// naive string differs from the symlink-resolved import.meta.url and the block silently never runs.
// Guard argv[1] (undefined when this module is imported, not run) so pathToFileURL doesn't throw —
// the reviewer (tools/reviewer/validate-ingest.mjs) imports this file for its exported helpers.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cfg = readConfig();
  const pack = {
    generated_by: "tools/classifier/context.mjs",
    repo_root: REPO,
    config: cfg,
    targets: resolveTargets(cfg),
    dimension_names: cfg.dimensions.map((d) => d.name),
    capture: opt.capture ? validateCapture(opt.capture) : null,
  };
  process.stdout.write(JSON.stringify(pack, null, 2) + "\n");
}
