#!/usr/bin/env node
// normalize-drops.mjs — the "Dropbox mode" half of ingestion. People (and tools) drop ARBITRARY
// files into _inbox/: a PDF from a presentation, a screenshot, a stray text note, a transcript
// export. The pipeline downstream speaks exactly one shape — m2's schema-v1 capture — so this
// script turns every raw drop into one, deterministically, before the classifier runs:
//
//   • text-like file   → its content becomes the capture body verbatim; the drop is removed
//   • PDF / image      → moved to _attachments/, capture links it; the classifier (which has the
//                        Read tool) reads the attachment itself to distil — no extraction here
//   • anything else    → moved to _attachments/, capture carries a QUESTION for the steward; the
//                        run is marked "unclear" so the ingest PR is routed to a human (needs-human)
//
// Like new-captures.mjs it works off a git diff range, so only files from THIS push are touched.
// A `.md` file whose name already matches the capture convention (<source>-<YYYY-MM-DD-HHMM>.md)
// is NOT a raw drop — it goes straight to the classifier (even if schema-broken; the classifier
// has a draft-PR flow for that).
//
// The script only mutates the WORKING TREE (writes captures, moves attachments, deletes embedded
// drops) and prints a JSON report; the calling workflow commits the result back to the pushed
// branch so the ingest PR later diffs cleanly against it. Pure Node, zero deps.
//
// Two detection modes:
//   --base/--head  git diff range — how the ingestion Action runs it (only THIS push's files)
//   --worktree     every raw drop currently sitting in _inbox/ — how inbox-watch runs it LOCALLY,
//                  so drops are already formatted as captures BEFORE they're ever pushed
//                  (Dropbox-like: the Action's range mode stays as the backstop for drops that
//                  arrive unformatted via Obsidian or GitHub web)
//
//   Usage:  node tools/normalizer/normalize-drops.mjs --base <sha> --head <sha> [--repo <root>]
//           node tools/normalizer/normalize-drops.mjs --worktree [--repo <root>]
//   Output: JSON on stdout:
//     { captures: ["_inbox/other-....md", ...],          ← generated, for the detect step
//       unclear:  [{file, question}, ...],               ← needs-human items, for the prompt
//       moved:    [{from, to}, ...], removed: [...], count: N }

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--base") opt.base = argv[++i];
  else if (argv[i] === "--head") opt.head = argv[++i];
  else if (argv[i] === "--repo") opt.repo = argv[++i];
  else if (argv[i] === "--worktree") opt.worktree = true;
}
const REPO = path.resolve(opt.repo || process.cwd());
const head = opt.head || "HEAD";
const log = (m) => process.stderr.write("normalize-drops: " + m + "\n");

function git(args) {
  const r = spawnSync("git", ["-C", REPO, ...args], { encoding: "utf8" });
  return { code: r.status ?? 1, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

// ---- what counts as a raw drop ----
const SCHEMA_FILES = new Set(["_inbox/_TEMPLATE.md", "_inbox/README.md", "_inbox/.gitkeep"]);
const CAPTURE_NAME = /^[a-z]+-\d{4}-\d{2}-\d{2}-\d{4}\.md$/;
function isRawDrop(rel) {
  if (!rel.startsWith("_inbox/")) return false;
  if (rel.slice("_inbox/".length).includes("/")) return false; // direct children only, like new-captures
  if (SCHEMA_FILES.has(rel)) return false;
  if (CAPTURE_NAME.test(path.basename(rel))) return false;     // already a capture — classifier's job
  const full = path.join(REPO, rel);
  return fs.existsSync(full) && fs.statSync(full).isFile();    // deleted in a later push = nothing to do
}

// ---- detect drops: worktree scan (local mode) or push range (Action mode) ----
let drops;
if (opt.worktree) {
  drops = fs.readdirSync(path.join(REPO, "_inbox"))
    .map((n) => path.posix.join("_inbox", n)).filter(isRawDrop).sort();
} else {
  let changed;
  if (opt.base && /^[0-9a-f]{7,40}$/i.test(opt.base) && opt.base !== "0".repeat(40)) {
    changed = git(["diff", "--name-only", "--diff-filter=AM", `${opt.base}..${head}`]);
  } else {
    changed = git(["ls-tree", "-r", "--name-only", head, "--", "_inbox/"]);
  }
  if (changed.code !== 0) { log("git detection failed: " + changed.err); process.exit(1); }
  drops = changed.out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).filter(isRawDrop).sort();
}

// ---- per-extension handling ----
const TEXT_EXT = new Set([".txt", ".text", ".md", ".markdown", ".csv", ".tsv", ".json", ".yml", ".yaml",
  ".vtt", ".srt", ".log", ".html", ".htm", ".xml", ".eml", ".rtf"]);
// Formats the classifier can open itself with the Read tool (PDF + images):
const READABLE_EXT = new Set([".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const MAX_EMBED = 100_000;          // bytes of text embedded verbatim into a capture body
const MAX_BYTES = 50 * 1024 * 1024; // beyond this the Brain is being used as blob storage — escalate

const pad = (n) => String(n).padStart(2, "0");
function captureFilename(when) {
  // No suffixes allowed by the validator — collisions bump the minute, same rule as everywhere else.
  let t = new Date(when);
  for (;;) {
    const name = `other-${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}-${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}.md`;
    if (!fs.existsSync(path.join(REPO, "_inbox", name))) return name;
    t = new Date(t.getTime() + 60_000);
  }
}
function capturedStamp(rel) {
  // the instant the material entered the Brain = the drop's commit time; an uncommitted local
  // drop (worktree mode) doesn't have one yet, so its file mtime is the honest stand-in
  const r = git(["log", "-1", "--format=%cI", ...(opt.worktree ? [] : [head]), "--", rel]);
  if (r.code === 0 && r.out) return new Date(r.out);
  try { return fs.statSync(path.join(REPO, rel)).mtime; } catch { return new Date(); }
}
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
const yq = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;

function moveToAttachments(rel) {
  const attDir = path.join(REPO, "_attachments");
  fs.mkdirSync(attDir, { recursive: true });
  let base = path.basename(rel);
  if (fs.existsSync(path.join(attDir, base))) {
    const ext = path.extname(base);
    base = `${path.basename(base, ext)}-${Date.now().toString(36)}${ext}`;
  }
  fs.renameSync(path.join(REPO, rel), path.join(attDir, base));
  return { to: path.posix.join("_attachments", base), name: base };
}

const report = { captures: [], unclear: [], moved: [], removed: [], count: 0 };

for (const rel of drops) {
  const ext = path.extname(rel).toLowerCase();
  const size = fs.statSync(path.join(REPO, rel)).size;
  const when = capturedStamp(rel);
  const origName = path.basename(rel);
  const fm = (title, extra = []) => [
    "---",
    "source:    other",
    `captured:  ${iso(when)}`,
    `title:     ${yq(title)}`,
    `source_detail: inbox-drop (${ext.replace(".", "") || "no extension"})`,
    ...extra,
    "---",
    "",
  ].join("\n");

  let body, title, question = null;

  if (size > MAX_BYTES) {
    const att = moveToAttachments(rel);
    report.moved.push({ from: rel, to: att.to });
    title = `Inbox drop (oversized): ${origName}`;
    question = `\`${origName}\` is ${(size / 1024 / 1024).toFixed(0)}MB — too large for a knowledge vault. Keep it, trim it, or host it elsewhere and link it?`;
    body = `An oversized file was dropped into the inbox and parked at [[${att.to}]].\n\n**Question for the steward:** ${question}\n`;
  } else if (TEXT_EXT.has(ext) && size <= MAX_EMBED) {
    // text → embed verbatim, drop file is consumed
    const content = fs.readFileSync(path.join(REPO, rel), "utf8");
    fs.rmSync(path.join(REPO, rel));
    report.removed.push(rel);
    title = `Inbox drop: ${origName}`;
    body = content.trimEnd() + "\n";
  } else if (READABLE_EXT.has(ext) || (TEXT_EXT.has(ext) && size > MAX_EMBED)) {
    // classifier-readable attachment (or text too big to embed) → park it, point the classifier at it
    const att = moveToAttachments(rel);
    report.moved.push({ from: rel, to: att.to });
    title = `Inbox drop: ${origName}`;
    body = `Raw file dropped into the inbox, parked at [[${att.to}]].\n\n**Classifier:** read the attachment (\`${att.to}\`) directly — its content is the capture material; distil from it, not from this stub.\n`;
  } else {
    // unknown / unreadable format (office docs, audio, video, archives, …) → park + ask
    const att = moveToAttachments(rel);
    report.moved.push({ from: rel, to: att.to });
    title = `Inbox drop (unclear): ${origName}`;
    question = `\`${origName}\` (${ext || "no extension"}) can't be read by the classifier. What is it, and how should it be distilled — e.g. export it to PDF/text, provide a transcript, or describe it?`;
    body = `A file the pipeline can't read was dropped into the inbox and parked at [[${att.to}]].\n\n**Question for the steward:** ${question}\n`;
  }

  const capName = captureFilename(when);
  fs.writeFileSync(path.join(REPO, "_inbox", capName), fm(title) + body);
  const capRel = path.posix.join("_inbox", capName);
  report.captures.push(capRel);
  if (question) report.unclear.push({ file: rel, capture: capRel, question });
  report.count++;
  log(`${rel} → ${capRel}${question ? " (unclear)" : ""}`);
}

process.stdout.write(JSON.stringify(report, null, 2) + "\n");
