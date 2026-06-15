#!/usr/bin/env node
// validate-ingest.mjs — the structural, AI-free reviewer for ingestion PRs (m7).
//
// It does NOT judge knowledge quality (that is the classifier's job, m3) — it enforces STRUCTURE and
// DATA-SAFETY. Given an ingestion PR's git diff range + the post-merge tree + the PR body, it checks
// that the diff matches the exact known-safe shape PROMPT.md instructs the classifier to produce, and
// that no confidence flag was raised. It emits ONE JSON verdict on stdout:
//
//   { "decision": "merge" | "escalate", "checks": [{id, passed, detail}], "summary": "..." }
//
// DEFAULT TO ESCALATE: merge is the narrow, fully-characterized case. Anything the validator can't
// prove safe escalates to a human. The verdict is in the JSON; exit code is 0 even on "escalate"
// (mirrors context.mjs's report-in-JSON contract). Exit non-zero ONLY on unusable input (can't read
// the repo / diff / config).
//
// The known-safe diff shape (PROMPT.md §3-§7, verified against real ingest/* branches):
//   - exactly 1 capture deletion  (D)  _inbox/<source>-<date>.md  (a real capture)
//   - exactly 1 new note          (A)  <dimension>/<slug>.md OR decisions/<slug>.md
//   - 1+ additive MOC backlink    (M)  <dim>/index.md and/or decisions/index.md  (append-only)
//   - 0 or 1 supersede flip       (M)  an existing decisions/<adr>.md  (frontmatter-only, bidirectional)
//
//   Usage:  node validate-ingest.mjs --repo . --base <sha> --head <sha> --pr-body-file <path> [--draft] [--dry-run]
//
// Reuses context.mjs's exported helpers (YAML parse, config + targets) instead of duplicating them.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  splitFrontmatter,
  parseYaml,
  readConfig,
  resolveTargets,
} from "../classifier/context.mjs";

// ---------- args ----------
const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  const k = argv[i];
  if (k === "--repo") opt.repo = argv[++i];
  else if (k === "--base") opt.base = argv[++i];
  else if (k === "--head") opt.head = argv[++i];
  else if (k === "--pr-body-file") opt.prBodyFile = argv[++i];
  else if (k === "--draft") opt.draft = true;
  else if (k === "--dry-run") opt.dryRun = true;
}
const REPO = path.resolve(opt.repo || process.cwd());
const HEAD = opt.head || "HEAD";
const die = (m) => { process.stderr.write(`validate-ingest: ${m}\n`); process.exit(1); };
if (!opt.base) die("--base <sha> is required (the PR's merge-base)");

// ---------- git helpers (same pattern as new-captures.mjs) ----------
function git(args) {
  const r = spawnSync("git", args, { cwd: REPO, encoding: "utf8" });
  return { code: r.status ?? 1, out: (r.stdout || ""), err: (r.stderr || "") };
}
function gitOrDie(args) {
  const r = git(args);
  if (r.code !== 0) die(`git ${args.join(" ")} failed: ${r.err.trim()}`);
  return r.out;
}

// ---------- capture detection (mirrors new-captures.mjs isCapture) ----------
const SCHEMA_FILES = new Set(["_inbox/_TEMPLATE.md", "_inbox/README.md", "_inbox/.gitkeep"]);
function isCapture(p) {
  if (!p.startsWith("_inbox/")) return false;
  if (p.slice("_inbox/".length).includes("/")) return false;
  if (!p.endsWith(".md")) return false;
  if (SCHEMA_FILES.has(p)) return false;
  return true;
}

// ---------- frontmatter of a file at a given tree-ish ----------
// We always read via `git show <treeish>:<path>` rather than the working tree, so the validator works
// identically whether HEAD is checked out (CI) or HEAD is just a ref being replayed (local/tests).
// Pass HEAD for the post-merge state, opt.base for the before state.
function frontmatterAt(treeish, relPath) {
  const ref = treeish === null ? HEAD : treeish;
  const r = git(["show", `${ref}:${relPath}`]);
  if (r.code !== 0) return null;
  const text = r.out;
  const { fm, body } = splitFrontmatter(text);
  return { frontmatter: fm === null ? {} : parseYaml(fm), body: body ?? "", raw: text, hasFm: fm !== null };
}

// ---------- wiki-link extraction + resolution ----------
function extractLinks(text) {
  const out = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    let target = m[1].split("|")[0].trim();   // strip |alias
    target = target.split("#")[0].trim();      // strip #anchor
    if (target) out.push(target);
  }
  return out;
}
function buildTreeIndex() {
  // post-merge file set = git ls-tree of HEAD (the PR head, where the capture is already deleted)
  const out = gitOrDie(["ls-tree", "-r", "--name-only", HEAD]);
  const files = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const set = new Set(files);
  const byBasename = new Set(files.map((f) => path.basename(f).replace(/\.md$/, "")));
  return { set, byBasename };
}
function linkResolves(target, tree) {
  // Obsidian-style: try <t>.md, <t> as-is, and a basename match anywhere in the tree.
  if (tree.set.has(`${target}.md`)) return true;
  if (tree.set.has(target)) return true;
  const base = path.basename(target).replace(/\.md$/, "");
  if (tree.byBasename.has(base)) return true;
  return false;
}

// ---------- PR-body confidence-flag markers (the contract in PROMPT.md §7) ----------
// Read from the PR BODY (not the note body), so a steward-note INSIDE an ADR body never trips this.
const FLAG_MARKERS = [
  { id: "hint_overridden", re: /hint\s+overrid/i, detail: "PR body signals the author's hint was overridden" },
  { id: "under_determined", re: /under-?determined dimension|close call/i, detail: "PR body signals an ambiguous / close-call dimension" },
  { id: "missing_prior_adr", re: /missing prior adr/i, detail: "PR body signals a referenced prior ADR could not be found" },
  { id: "schema_violation", re: /schema violation|malformed capture/i, detail: "PR body signals a schema violation in the capture" },
];

// ============================================================
//  THE VALIDATOR
// ============================================================
function validate() {
  const checks = [];
  const add = (id, passed, detail) => checks.push({ id, passed, detail: passed ? "" : detail });

  const cfg = readConfig();                 // dimensions, infra_folders, glossary (config-driven)
  const targets = resolveTargets(cfg);
  const dimensionNames = new Set(cfg.dimensions.map((d) => d.name));
  const decisionsFolder = targets.decisions.folder;            // e.g. "decisions"
  const mocPaths = new Set([
    ...targets.dimensions.map((t) => t.moc_note).filter(Boolean),
    `${decisionsFolder}/index.md`,
  ]);

  // --- the diff: name-status A/M/D over base..head ---
  const nameStatus = gitOrDie(["diff", "--name-status", `${opt.base}..${HEAD}`])
    .split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .map((l) => {
      const parts = l.split(/\t/);
      return { status: parts[0][0], path: parts[parts.length - 1] }; // R/C have extra cols; take last
    });

  const deletions = nameStatus.filter((e) => e.status === "D");
  const adds = nameStatus.filter((e) => e.status === "A");
  const mods = nameStatus.filter((e) => e.status === "M");

  // ---- C1: exactly one capture removed ----
  const capDeletions = deletions.filter((e) => isCapture(e.path));
  const nonCapDeletions = deletions.filter((e) => !isCapture(e.path));
  add("C1_one_capture_removed",
    capDeletions.length === 1 && nonCapDeletions.length === 0,
    `expected exactly 1 _inbox capture deleted and no other deletions; got ${capDeletions.length} capture(s) + ${nonCapDeletions.length} other deletion(s)` +
    (nonCapDeletions.length ? ` [${nonCapDeletions.map((d) => d.path).join(", ")}] — any deletion other than the ingested capture needs a human` : ""));
  const deletedCapture = capDeletions.length === 1 ? capDeletions[0].path : null;

  // ---- C3: exactly one new note in a valid location ----
  const noteAdds = adds.filter((e) => e.path.endsWith(".md") && path.basename(e.path) !== "index.md" && !e.path.startsWith("_inbox/"));
  let newNote = null;
  if (noteAdds.length === 1) {
    const p = noteAdds[0].path;
    const dir = p.split("/")[0];
    const inDimension = dimensionNames.has(dir) && p.split("/").length === 2;
    const inDecisions = dir === decisionsFolder && p.split("/").length === 2;
    if (inDimension || inDecisions) newNote = p;
    add("C3_one_new_note_valid_location", !!newNote,
      `new note "${p}" must live directly under a config dimension {${[...dimensionNames].join(",")}} or ${decisionsFolder}/`);
  } else {
    add("C3_one_new_note_valid_location", false,
      `expected exactly 1 new note (A); got ${noteAdds.length}${noteAdds.length ? ` [${noteAdds.map((a) => a.path).join(", ")}]` : ""}`);
  }

  // ---- C2: every change is one of {capture-D, new-note-A, additive MOC-M, supersede-flip-M} ----
  // (supersede classification is finalized in C6; here we bucket and flag anything unrecognized)
  const supersedeMods = mods.filter((e) => e.path.startsWith(`${decisionsFolder}/`) && !mocPaths.has(e.path));
  const mocMods = mods.filter((e) => mocPaths.has(e.path));
  const unexpected = nameStatus.filter((e) => {
    if (e.status === "D") return !isCapture(e.path);                 // any non-capture deletion
    if (e.status === "A") return e.path !== newNote;                 // any add that isn't the one note
    if (e.status === "M") return !mocPaths.has(e.path) && !supersedeMods.includes(e);
    return true;                                                     // R/C/T → unexpected
  });
  add("C2_only_allowed_files_changed", unexpected.length === 0,
    `unexpected change(s) outside the known-safe ingestion shape: ${unexpected.map((e) => `${e.status} ${e.path}`).join(", ")}`);

  // ---- C4: new-note frontmatter completeness + dimension + kind/location + provenance ----
  if (newNote) {
    const note = frontmatterAt(null, newNote);
    if (!note || !note.hasFm) {
      add("C4_frontmatter_complete", false, `new note "${newNote}" has no frontmatter`);
    } else {
      const f = note.frontmatter;
      const required = ["dimension", "kind", "title", "source_capture", "captured"];
      const missing = required.filter((k) => f[k] === undefined || f[k] === "" || f[k] === null);
      const kindOk = ["adr", "spec", "research"].includes(f.kind);
      const dimOk = dimensionNames.has(f.dimension);
      const inDecisions = newNote.split("/")[0] === decisionsFolder;
      const kindLocOk = (f.kind === "adr") === inDecisions;   // ADR ⟺ decisions/
      const provenanceOk = deletedCapture && f.source_capture === deletedCapture;
      const reasons = [];
      if (missing.length) reasons.push(`missing/empty: ${missing.join(", ")}`);
      if (!kindOk) reasons.push(`kind "${f.kind}" not in {adr,spec,research}`);
      if (!dimOk) reasons.push(`dimension "${f.dimension}" not in config`);
      if (!kindLocOk) reasons.push(`kind/location mismatch: kind=${f.kind} but ${inDecisions ? "in" : "not in"} ${decisionsFolder}/`);
      if (!provenanceOk) reasons.push(`source_capture "${f.source_capture}" must equal the deleted capture "${deletedCapture}"`);
      add("C4_frontmatter_complete", reasons.length === 0, reasons.join("; "));
    }
  } else {
    add("C4_frontmatter_complete", false, "skipped — no valid new note (see C3)");
  }

  // ---- C5: MOC edits are additive-only (only the placeholder may be removed; adds are [[ ]] bullets) ----
  {
    // The MOC placeholder is an italic blurb that may wrap across two lines, e.g.
    //   *No notes yet — this dimension is structurally ready but empty. The first capture filed here will
    //   appear in this list.*
    // Both lines are part of the same removable placeholder. A line counts as placeholder if it opens
    // the blurb ("*No notes/ADRs/decisions yet") or is a continuation/closer of an italic blurb
    // (starts or ends with the italic marker `*`). Backlink bullets never match this.
    const PLACEHOLDER = (line) => {
      const c = line.trim();
      if (/^\*\s*no (notes|adrs|decisions) yet/i.test(c)) return true;   // opening line
      if (/^- \s*\[\[/.test(c)) return false;                            // a real bullet is never placeholder
      if (c.startsWith("*") || c.endsWith("*")) return true;            // italic continuation/closer
      return false;
    };
    const failures = [];
    for (const moc of mocMods) {
      const patch = gitOrDie(["diff", "--unified=0", `${opt.base}..${HEAD}`, "--", moc.path]);
      const removed = patch.split(/\r?\n/).filter((l) => l.startsWith("-") && !l.startsWith("---"));
      const added = patch.split(/\r?\n/).filter((l) => l.startsWith("+") && !l.startsWith("+++"));
      // Removed lines must be the placeholder (or blank) — anything else is a clobber → fail.
      const badRemoved = removed.filter((l) => { const c = l.slice(1).trim(); return c !== "" && !PLACEHOLDER(c); });
      // Added lines must form backlink bullets. A bullet may wrap across lines, so the added block is
      // valid iff: it contains at least one `- [[…]]` bullet, AND no added line is a structural edit
      // (a heading `#…`, or frontmatter `---`). Non-bullet added lines are treated as bullet
      // continuations (wrapped description text). This stays data-safe: removals are still restricted
      // to the placeholder (badRemoved above), so no existing backlink can be dropped or rewritten.
      const addedContent = added.map((l) => l.slice(1)).filter((c) => c.trim() !== "");
      const hasBullet = addedContent.some((c) => /^\s*-\s*\[\[/.test(c));
      const structuralAdd = addedContent.filter((c) => /^\s*#/.test(c.trim()) || c.trim() === "---");
      const badAdds = (!hasBullet && addedContent.length > 0)
        ? addedContent.map((c) => `(no backlink bullet) ${c.trim()}`)
        : structuralAdd;
      if (badRemoved.length) failures.push(`${moc.path}: removed non-placeholder line(s): ${badRemoved.map((l) => l.slice(1).trim()).join(" | ")}`);
      if (badAdds.length) failures.push(`${moc.path}: added non-backlink line(s): ${badAdds.map((l) => l.slice(1).trim()).join(" | ")}`);
    }
    add("C5_moc_additive_only", failures.length === 0, failures.join("; "));
  }

  // ---- C6: supersede edits are frontmatter-only + bidirectional ----
  {
    const failures = [];
    for (const sup of supersedeMods) {
      // body must be byte-identical (ADRs immutable); only frontmatter may change
      const before = frontmatterAt(opt.base, sup.path);
      const after = frontmatterAt(null, sup.path);
      if (!before || !after) { failures.push(`${sup.path}: cannot read both versions`); continue; }
      if (before.body.trim() !== after.body.trim()) {
        failures.push(`${sup.path}: ADR body changed (ADRs are immutable; supersede must be frontmatter-only)`);
      }
      // status must flip to superseded, superseded_by must point at the new note
      const newStatus = after.frontmatter.status;
      if (newStatus !== "superseded") failures.push(`${sup.path}: status is "${newStatus}", expected "superseded"`);
      const supersededBy = JSON.stringify(after.frontmatter.superseded_by || "");
      // bidirectionality: new note's supersedes[] includes the old ADR
      if (newNote) {
        const note = frontmatterAt(null, newNote);
        const supersedes = JSON.stringify(note?.frontmatter?.supersedes || "");
        const oldBase = path.basename(sup.path).replace(/\.md$/, "");
        const newBase = path.basename(newNote).replace(/\.md$/, "");
        if (!supersedes.includes(oldBase) && !supersedes.includes(sup.path.replace(/\.md$/, ""))) {
          failures.push(`one-sided supersede: new note's supersedes[] does not reference ${sup.path}`);
        }
        if (!supersededBy.includes(newBase) && !supersededBy.includes(newNote.replace(/\.md$/, ""))) {
          failures.push(`one-sided supersede: ${sup.path} superseded_by does not reference the new note`);
        }
      } else {
        failures.push(`${sup.path}: supersede edit present but no valid new note to pair with`);
      }
    }
    add("C6_supersede_bidirectional", failures.length === 0, failures.join("; "));
  }

  // ---- C7: every [[link]] resolves in the post-merge tree ----
  {
    const tree = buildTreeIndex();
    const dangling = [];
    const sources = [];
    if (newNote) sources.push({ where: newNote, text: frontmatterAt(null, newNote)?.raw || "" });
    for (const moc of mocMods) {
      const patch = gitOrDie(["diff", "--unified=0", `${opt.base}..${HEAD}`, "--", moc.path]);
      const addedText = patch.split(/\r?\n/).filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1)).join("\n");
      sources.push({ where: `${moc.path} (added)`, text: addedText });
    }
    for (const s of sources) {
      for (const link of extractLinks(s.text)) {
        if (!linkResolves(link, tree)) dangling.push(`${s.where}: [[${link}]] does not resolve`);
      }
    }
    add("C7_links_resolve", dangling.length === 0, dangling.join("; "));
  }

  // ---- C8: no existing-note body overwrite (conjunction; explicit for a clear verdict reason) ----
  {
    const c2 = checks.find((c) => c.id === "C2_only_allowed_files_changed").passed;
    const c5 = checks.find((c) => c.id === "C5_moc_additive_only").passed;
    const c6 = checks.find((c) => c.id === "C6_supersede_bidirectional").passed;
    add("C8_no_body_overwrite", c2 && c5 && c6,
      "an existing note's content was changed outside the additive-MOC / bidirectional-supersede patterns (see C2/C5/C6)");
  }

  // ---- C9: PR-body confidence flags + draft ----
  {
    let body = "";
    if (opt.prBodyFile && fs.existsSync(opt.prBodyFile)) body = fs.readFileSync(opt.prBodyFile, "utf8");
    const hits = [];
    if (opt.draft) hits.push("PR is a draft — the classifier marks judgment calls as draft");
    for (const m of FLAG_MARKERS) if (m.re.test(body)) hits.push(m.detail);
    add("C9_no_confidence_flags", hits.length === 0, hits.join("; "));
  }

  // ---- C10 (soft): the deleted capture was schema-valid, OR the PR is draft ----
  {
    let pass = true, detail = "";
    if (deletedCapture && !opt.draft) {
      const before = frontmatterAt(opt.base, deletedCapture);
      if (before && before.hasFm) {
        const f = before.frontmatter;
        const SOURCE_ENUM = ["manual", "meet", "slack", "email", "other"];
        const probs = [];
        for (const r of ["source", "captured", "title"]) if (f[r] === undefined || f[r] === "" || f[r] === null) probs.push(`missing ${r}`);
        if (f.source && !SOURCE_ENUM.includes(f.source)) probs.push(`source "${f.source}" not in enum`);
        if (probs.length) { pass = false; detail = `deleted capture had schema issues but PR is not draft: ${probs.join(", ")}`; }
      }
    }
    add("C10_capture_schema_sane", pass, detail);
  }

  const failed = checks.filter((c) => !c.passed);
  const decision = failed.length === 0 ? "merge" : "escalate";
  const summary = decision === "merge"
    ? `All ${checks.length} structural checks passed — safe to auto-merge.`
    : `${failed.length} of ${checks.length} checks failed → escalate to a human: ${failed.map((c) => c.id).join(", ")}`;
  return { decision, dry_run: !!opt.dryRun, new_note: newNote, deleted_capture: deletedCapture, checks, summary };
}

// ---------- run ----------
let verdict;
try {
  verdict = validate();
} catch (e) {
  // any unexpected internal error → escalate (never silently merge), but report it
  verdict = {
    decision: "escalate",
    checks: [{ id: "internal_error", passed: false, detail: String(e && e.message || e) }],
    summary: `validator crashed → escalate to a human: ${String(e && e.message || e)}`,
  };
}
process.stdout.write(JSON.stringify(verdict, null, 2) + "\n");
// exit 0 always (verdict is in the JSON); the workflow branches on .decision
