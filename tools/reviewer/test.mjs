#!/usr/bin/env node
// test.mjs — exercises validate-ingest.mjs against synthetic ingestion-PR diffs. Builds throwaway git
// repos in os.tmpdir(), commits a `base` state (MOCs with placeholders, an existing ADR), commits a
// `head` state representing each diff shape, and asserts the validator's JSON verdict. No framework —
// pure asserts, runs under bare `node` in CI with zero install. Exit non-zero on any failure.
//
//   Usage:  node test.mjs            (run from tools/reviewer/)

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VALIDATOR = path.join(HERE, "validate-ingest.mjs");

let failures = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ok   ${msg}`); else { console.error(`  FAIL ${msg}`); failures++; } };

// ---- throwaway repo scaffold ----
function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}
function write(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}
const CONFIG = `company: Test
repo: x/y
default_branch: main
dimensions:
  - name: technical
    blurb: t
  - name: design
    blurb: d
infra_folders:
  - _inbox
  - decisions
glossary_note: ubiquitous-language
`;
const MOC_PLACEHOLDER = (kind) => `# index\n\n## ${kind === "decisions" ? "Decisions" : "Notes"}\n*No ${kind === "decisions" ? "ADRs" : "notes"} yet — this dimension is structurally ready but empty. The first capture filed here will\nappear in this list.*\n`;

// Build a base repo: config, MOCs with placeholders, an existing capture, an existing accepted ADR.
function baseRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reviewer-test-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  write(root, "brain.config.yml", CONFIG);
  write(root, "design/index.md", MOC_PLACEHOLDER("design"));
  write(root, "technical/index.md", MOC_PLACEHOLDER("technical"));
  write(root, "decisions/index.md", MOC_PLACEHOLDER("decisions"));
  write(root, "ubiquitous-language.md", "# glossary\n");
  write(root, "_inbox/_TEMPLATE.md", "template\n");
  write(root, "_inbox/slack-2026-06-09-1155.md", "---\nsource: slack\ncaptured: 2026-06-09T11:55:00Z\ntitle: Dark mode\n---\nbody\n");
  write(root, "decisions/ADR-0001-old-pricing.md", "---\nid: ADR-0001\nkind: adr\nstatus: accepted\ntitle: Old pricing\nsuperseded_by: []\n---\n\n# Old pricing\nBody that must stay immutable.\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "base"]);
  return { root, base: git(root, ["rev-parse", "HEAD"]) };
}
function commitHead(root, msg) {
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", msg]);
  return git(root, ["rev-parse", "HEAD"]);
}
function runValidator(root, base, head, prBody, draft) {
  const bodyFile = path.join(root, ".prbody.txt");
  fs.writeFileSync(bodyFile, prBody || "clean, no flags");
  const args = [VALIDATOR, "--repo", root, "--base", base, "--head", head, "--pr-body-file", bodyFile];
  if (draft) args.push("--draft");
  const r = spawnSync("node", args, { encoding: "utf8" });
  if (!r.stdout) throw new Error(`validator no output: ${r.stderr}`);
  return JSON.parse(r.stdout);
}
const failedIds = (v) => v.checks.filter((c) => !c.passed).map((c) => c.id);

// A clean research-note PR (the dark-mode shape): rm capture, add note, append MOC bullet.
function cleanNote(root) {
  fs.rmSync(path.join(root, "_inbox/slack-2026-06-09-1155.md"));
  write(root, "design/dark-mode.md", "---\ndimension: design\nkind: research\ntitle: Dark mode\nsource_capture: _inbox/slack-2026-06-09-1155.md\ncaptured: 2026-06-09T11:55:00Z\n---\n\n# Dark mode\nSee [[design/index]].\n");
  write(root, "design/index.md", "# index\n\n## Notes\n- [[design/dark-mode]] — players want a dark mode.\n");
}

console.log("MERGE cases:");
{
  const { root, base } = baseRepo();
  cleanNote(root);
  const head = commitHead(root, "ingest dark mode");
  const v = runValidator(root, base, head);
  ok(v.decision === "merge", `clean research note → merge (got ${v.decision}: ${failedIds(v)})`);
  fs.rmSync(root, { recursive: true, force: true });
}
{
  // ADR, no supersede: rm capture, add ADR in decisions/, append two MOCs (decisions + technical)
  const { root, base } = baseRepo();
  fs.rmSync(path.join(root, "_inbox/slack-2026-06-09-1155.md"));
  write(root, "decisions/ADR-0002-pin-sha.md", "---\nid: ADR-0002\ndimension: technical\nkind: adr\nstatus: proposed\ntitle: Pin SHA\nsource_capture: _inbox/slack-2026-06-09-1155.md\ncaptured: 2026-06-09T11:55:00Z\nsupersedes: []\n---\n\n# Pin SHA\nSee [[technical/index]] and [[decisions/index]].\n");
  write(root, "decisions/index.md", "# index\n\n## Decisions\n- [[decisions/ADR-0002-pin-sha]] — pin CI actions to SHA before\n  going wide. *(proposed)*\n");
  write(root, "technical/index.md", "# index\n\n## Notes\n- [[decisions/ADR-0002-pin-sha]] — pin CI actions to SHA.\n");
  const head = commitHead(root, "ingest ADR");
  const v = runValidator(root, base, head);
  ok(v.decision === "merge", `ADR no-supersede (wrapped bullet, two MOCs) → merge (got ${v.decision}: ${failedIds(v)})`);
  fs.rmSync(root, { recursive: true, force: true });
}
{
  // ADR with valid bidirectional supersede
  const { root, base } = baseRepo();
  fs.rmSync(path.join(root, "_inbox/slack-2026-06-09-1155.md"));
  write(root, "decisions/ADR-0002-new-pricing.md", "---\nid: ADR-0002\ndimension: technical\nkind: adr\nstatus: proposed\ntitle: New pricing\nsource_capture: _inbox/slack-2026-06-09-1155.md\ncaptured: 2026-06-09T11:55:00Z\nsupersedes: [\"[[decisions/ADR-0001-old-pricing]]\"]\n---\n\n# New pricing\nSee [[decisions/index]].\n");
  // flip the old ADR — frontmatter only, body byte-identical
  write(root, "decisions/ADR-0001-old-pricing.md", "---\nid: ADR-0001\nkind: adr\nstatus: superseded\ntitle: Old pricing\nsuperseded_by: [\"[[decisions/ADR-0002-new-pricing]]\"]\n---\n\n# Old pricing\nBody that must stay immutable.\n");
  write(root, "decisions/index.md", "# index\n\n## Decisions\n- [[decisions/ADR-0002-new-pricing]] — supersedes old pricing.\n");
  const head = commitHead(root, "ingest superseding ADR");
  const v = runValidator(root, base, head);
  ok(v.decision === "merge", `ADR + valid bidirectional supersede → merge (got ${v.decision}: ${failedIds(v)})`);
  fs.rmSync(root, { recursive: true, force: true });
}

console.log("ESCALATE cases (assert the specific check fires):");
function escalateCase(name, mutate, expectId, prBody, draft) {
  const { root, base } = baseRepo();
  mutate(root);
  const head = commitHead(root, name);
  const v = runValidator(root, base, head, prBody, draft);
  const ids = failedIds(v);
  ok(v.decision === "escalate" && ids.includes(expectId), `${name} → escalate via ${expectId} (got ${v.decision}: ${ids})`);
  fs.rmSync(root, { recursive: true, force: true });
}
// C1: extra deletion (capture + an existing note)
escalateCase("extra deletion", (r) => { cleanNote(r); fs.rmSync(path.join(r, "ubiquitous-language.md")); }, "C1_one_capture_removed");
// C3: note in unknown dimension
escalateCase("unknown dimension", (r) => {
  fs.rmSync(path.join(r, "_inbox/slack-2026-06-09-1155.md"));
  write(r, "legal/foo.md", "---\ndimension: legal\nkind: research\ntitle: x\nsource_capture: _inbox/slack-2026-06-09-1155.md\ncaptured: 2026-06-09T11:55:00Z\n---\nbody\n");
}, "C3_one_new_note_valid_location");
// C4: missing required frontmatter (no dimension)
escalateCase("missing frontmatter", (r) => {
  fs.rmSync(path.join(r, "_inbox/slack-2026-06-09-1155.md"));
  write(r, "design/foo.md", "---\nkind: research\ntitle: x\nsource_capture: _inbox/slack-2026-06-09-1155.md\ncaptured: 2026-06-09T11:55:00Z\n---\nbody\n");
  write(r, "design/index.md", "# index\n\n## Notes\n- [[design/foo]] — x.\n");
}, "C4_frontmatter_complete");
// C4: kind/location mismatch (ADR in a dimension folder)
escalateCase("kind-location mismatch", (r) => {
  fs.rmSync(path.join(r, "_inbox/slack-2026-06-09-1155.md"));
  write(r, "design/foo.md", "---\ndimension: design\nkind: adr\ntitle: x\nsource_capture: _inbox/slack-2026-06-09-1155.md\ncaptured: 2026-06-09T11:55:00Z\n---\nbody\n");
  write(r, "design/index.md", "# index\n\n## Notes\n- [[design/foo]] — x.\n");
}, "C4_frontmatter_complete");
// C4: source_capture mismatch
escalateCase("provenance mismatch", (r) => {
  fs.rmSync(path.join(r, "_inbox/slack-2026-06-09-1155.md"));
  write(r, "design/foo.md", "---\ndimension: design\nkind: research\ntitle: x\nsource_capture: _inbox/wrong.md\ncaptured: 2026-06-09T11:55:00Z\n---\nbody\n");
  write(r, "design/index.md", "# index\n\n## Notes\n- [[design/foo]] — x.\n");
}, "C4_frontmatter_complete");
// C5: MOC clobber (an existing bullet removed)
escalateCase("moc clobber", (r) => {
  // base MOC has placeholder; head removes a real-looking existing structural line (the heading)
  cleanNote(r);
  write(r, "design/index.md", "# index\n- [[design/dark-mode]] — players want a dark mode.\n");  // removed "## Notes" heading
}, "C5_moc_additive_only");
// C6: one-sided supersede (new note supersedes, old ADR not flipped)
escalateCase("one-sided supersede", (r) => {
  fs.rmSync(path.join(r, "_inbox/slack-2026-06-09-1155.md"));
  write(r, "decisions/ADR-0002-new.md", "---\nid: ADR-0002\ndimension: technical\nkind: adr\nstatus: proposed\ntitle: New\nsource_capture: _inbox/slack-2026-06-09-1155.md\ncaptured: 2026-06-09T11:55:00Z\nsupersedes: [\"[[decisions/ADR-0001-old-pricing]]\"]\n---\n\n# New\nSee [[decisions/index]].\n");
  // old ADR body changed too (immutability violation) AND superseded_by not set → C6
  write(r, "decisions/ADR-0001-old-pricing.md", "---\nid: ADR-0001\nkind: adr\nstatus: accepted\ntitle: Old pricing\nsuperseded_by: []\n---\n\n# Old pricing\nTAMPERED body.\n");
  write(r, "decisions/index.md", "# index\n\n## Decisions\n- [[decisions/ADR-0002-new]] — new.\n");
}, "C6_supersede_bidirectional");
// C7: dangling link
escalateCase("dangling link", (r) => {
  fs.rmSync(path.join(r, "_inbox/slack-2026-06-09-1155.md"));
  write(r, "design/foo.md", "---\ndimension: design\nkind: research\ntitle: x\nsource_capture: _inbox/slack-2026-06-09-1155.md\ncaptured: 2026-06-09T11:55:00Z\n---\n\n# x\nSee [[decisions/ADR-9999-nope]].\n");
  write(r, "design/index.md", "# index\n\n## Notes\n- [[design/foo]] — x.\n");
}, "C7_links_resolve");
// C2: unexpected file changed (edits brain.config.yml)
escalateCase("unexpected file changed", (r) => {
  cleanNote(r);
  fs.appendFileSync(path.join(r, "brain.config.yml"), "\n# sneaky edit\n");
}, "C2_only_allowed_files_changed");
// C9: PR body flag
escalateCase("hint-overridden flag", (r) => cleanNote(r), "C9_no_confidence_flags", "We picked product; hint overridden: author said design.");
// C9: draft
escalateCase("draft PR", (r) => cleanNote(r), "C9_no_confidence_flags", "clean", true);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
