#!/usr/bin/env node
// test.mjs — exercises context.mjs against valid temp-fixture captures (must pass schema) and a set
// of deliberately-broken inline fixtures (must be caught). No test framework — pure asserts so it
// runs under bare `node` in CI with zero install. Exit non-zero on any failure.
//
//   Usage:  node test.mjs            (run from tools/classifier/, repo root auto-detected two up)

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CTX = path.join(HERE, "context.mjs");

let failures = 0;
const ok = (cond, msg) => { if (cond) { console.log(`  ok   ${msg}`); } else { console.error(`  FAIL ${msg}`); failures++; } };

function runCtx(args) {
  const r = spawnSync("node", [CTX, ...args], { encoding: "utf8" });
  if (r.status !== 0 && !r.stdout) throw new Error(`context.mjs crashed: ${r.stderr}`);
  return { code: r.status, json: r.stdout ? JSON.parse(r.stdout) : null, err: r.stderr };
}

// Build a throwaway knowledge repo on disk (config + dimension folders + infra + glossary), so the
// config/targets test runs against a real Brain — NOT against the engine root, which carries no
// brain.config.yml since the engine/knowledge split (the engine is never itself a Brain).
function makeBrain(extra = "") {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "brain-classifier-test-"));
  fs.writeFileSync(path.join(tmp, "brain.config.yml"),
    "company: Test\nrepo: x/y\ndefault_branch: main\ndimensions:\n  - name: technical\n    blurb: t\ninfra_folders:\n  - _inbox\n  - decisions\nglossary_note: ubiquitous-language\n");
  for (const d of ["_inbox", "decisions", "technical"]) fs.mkdirSync(path.join(tmp, d));
  fs.writeFileSync(path.join(tmp, "technical", "index.md"), "# technical\n");
  fs.writeFileSync(path.join(tmp, "decisions", "index.md"), "# decisions\n");
  fs.writeFileSync(path.join(tmp, "ubiquitous-language.md"), "# glossary\n");
  return tmp;
}

console.log("config + targets:");
{
  const tmp = makeBrain();
  const { json } = runCtx(["--repo", tmp]);
  ok(json.dimension_names.length >= 1, "dimensions read from brain.config.yml (not hardcoded)");
  ok(json.dimension_names.includes("technical"), "technical dimension present");
  ok(json.targets.dimensions.every((t) => t.exists), "every dimension folder exists on disk");
  ok(json.targets.decisions.exists, "decisions/ folder exists");
  ok(json.targets.glossary.exists, "glossary note exists");
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("valid captures (must validate clean):");
{
  // self-contained fixtures in a throwaway repo root — the template Brain ships an empty _inbox/
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "brain-classifier-test-valid-"));
  fs.writeFileSync(path.join(tmp, "brain.config.yml"),
    "company: Test\nrepo: x/y\ndefault_branch: main\ndimensions:\n  - name: technical\n    blurb: t\ninfra_folders:\n  - _inbox\n  - decisions\nglossary_note: ubiquitous-language\n");
  fs.mkdirSync(path.join(tmp, "_inbox"));
  const fixtures = {
    "manual-2026-06-09-1030.md":
      "---\nsource: manual\ncaptured: 2026-06-09T10:30:00Z\ntitle: Solo note\n---\nA plain manual note body.",
    "meet-2026-06-09-1400.md":
      '---\nsource: meet\ncaptured: 2026-06-09T14:00:00Z\ntitle: Standup\nparticipants: [Bob, Alice]\nfile: "standup.transcript.txt"\n---\n[14:00] Bob: hello\n[14:01] Alice: hi',
  };
  for (const [name, body] of Object.entries(fixtures)) {
    fs.writeFileSync(path.join(tmp, "_inbox", name), body);
    const { json } = runCtx(["--repo", tmp, "--capture", path.join("_inbox", name)]);
    ok(json.capture.schema_ok, `${name} passes schema v1 (violations: ${JSON.stringify(json.capture.schema_violations)})`);
    ok(json.capture.body_raw.length > 0, `${name} has a non-empty raw body`);
  }

  console.log("source-specific presence is signal, not error:");
  const { json } = runCtx(["--repo", tmp, "--capture", "_inbox/manual-2026-06-09-1030.md"]);
  ok(json.capture.source_specific.participants.present === false, "solo manual note: participants absent, still schema_ok");
  ok(json.capture.schema_ok, "absent source-specific field does not fail validation");
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("broken fixtures (must be CAUGHT):");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "brain-classifier-test-"));
  // a throwaway repo root with a minimal config so context.mjs has dimensions to resolve
  fs.writeFileSync(path.join(tmp, "brain.config.yml"),
    "company: Test\nrepo: x/y\ndefault_branch: main\ndimensions:\n  - name: technical\n    blurb: t\ninfra_folders:\n  - _inbox\n  - decisions\nglossary_note: ubiquitous-language\n");
  fs.mkdirSync(path.join(tmp, "_inbox"));

  const cases = [
    { name: "manual-2026-06-09-0000.md", body: "---\ncaptured: 2026-06-09T00:00:00Z\ntitle: no source\n---\nbody", expect: /required field `source`/ },
    { name: "manual-2026-06-09-0001.md", body: "---\nsource: manual\ncaptured: 2026-06-09T00:00:00Z\ntitle: \"\"\n---\nbody", expect: /required field `title`/ },
    { name: "manual-2026-06-09-0002.md", body: "---\nsource: weird\ncaptured: 2026-06-09T00:00:00Z\ntitle: bad enum\n---\nbody", expect: /not in enum/ },
    { name: "other-2026-06-09-0003.md", body: "---\nsource: other\ncaptured: 2026-06-09T00:00:00Z\ntitle: missing detail\n---\nbody", expect: /requires `source_detail`/ },
    { name: "manual-2026-06-09-0004.md", body: "---\nsource: manual\ncaptured: yesterday\ntitle: bad date\n---\nbody", expect: /not ISO-8601 UTC/ },
    { name: "BADNAME.md", body: "---\nsource: manual\ncaptured: 2026-06-09T00:00:00Z\ntitle: bad filename\n---\nbody", expect: /doesn't match <source>/ },
  ];
  for (const c of cases) {
    const p = path.join(tmp, "_inbox", c.name);
    fs.writeFileSync(p, c.body);
    const { json } = runCtx(["--repo", tmp, "--capture", path.join("_inbox", c.name)]);
    const caught = json.capture.schema_violations.some((v) => c.expect.test(v));
    ok(caught, `${c.name}: caught ${c.expect} (got ${JSON.stringify(json.capture.schema_violations)})`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("new-captures detection (which _inbox files an ingestion run processes):");
{
  const NC = path.join(HERE, "new-captures.mjs");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "brain-newcaptures-test-"));
  const g = (args) => {
    const r = spawnSync("git", args, { cwd: tmp, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout.trim();
  };
  // throwaway repo so the diff range is deterministic and isolated from this branch's history
  g(["init", "-q"]);
  g(["config", "user.email", "t@t"]);
  g(["config", "user.name", "t"]);
  fs.mkdirSync(path.join(tmp, "_inbox"));
  fs.writeFileSync(path.join(tmp, "_inbox", "README.md"), "schema");
  fs.writeFileSync(path.join(tmp, "_inbox", "_TEMPLATE.md"), "tmpl");
  fs.writeFileSync(path.join(tmp, "_inbox", ".gitkeep"), "");
  g(["add", "-A"]);
  g(["commit", "-qm", "schema only"]);
  const base = g(["rev-parse", "HEAD"]);
  // a new capture lands + a schema file is edited (must NOT count) + a non-capture nested file
  fs.writeFileSync(path.join(tmp, "_inbox", "manual-2026-06-10-0900.md"), "new capture");
  fs.writeFileSync(path.join(tmp, "_inbox", "README.md"), "schema edited");
  fs.mkdirSync(path.join(tmp, "_inbox", "sub"));
  fs.writeFileSync(path.join(tmp, "_inbox", "sub", "nope.md"), "nested, not a capture");
  g(["add", "-A"]);
  g(["commit", "-qm", "add capture + edit schema"]);
  const head = g(["rev-parse", "HEAD"]);

  const run = (args) => spawnSync("node", [NC, ...args], { cwd: tmp, encoding: "utf8" }).stdout.trim();
  const diffOut = run(["--base", base, "--head", head]).split("\n").filter(Boolean);
  ok(diffOut.includes("_inbox/manual-2026-06-10-0900.md"), "added capture is detected");
  ok(!diffOut.includes("_inbox/README.md"), "edited schema file is NOT treated as a capture");
  ok(!diffOut.some((p) => p.includes("/sub/")), "nested non-capture file is excluded");
  ok(diffOut.length === 1, `exactly the one real capture detected (got ${JSON.stringify(diffOut)})`);

  const zeroBase = run(["--base", "0".repeat(40), "--head", head]).split("\n").filter(Boolean);
  ok(zeroBase.includes("_inbox/manual-2026-06-10-0900.md"), "all-zero base falls back to all present captures");
  ok(!zeroBase.includes("_inbox/_TEMPLATE.md"), "fallback still excludes _TEMPLATE.md");

  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
