#!/usr/bin/env node
// new-captures.mjs — given a git diff range (a push), print the _inbox/ capture files that were
// ADDED or MODIFIED in that range, one per line. The ingestion Action runs this to know exactly
// which captures to classify, so the headless classifier never has to guess "what's new" from a
// folder listing (which would re-process everything every run).
//
// What counts as a capture: a file directly under _inbox/ ending in .md, EXCLUDING the schema files
// _TEMPLATE.md and README.md (those are m2's contract, not captures) and the .gitkeep placeholder.
// Deleted files are ignored (a capture removed by a prior ingestion PR must not re-trigger).
//
//   Usage:  node new-captures.mjs --base <sha> --head <sha>
//           node new-captures.mjs --base <sha>            # head defaults to HEAD
//   Output: newline-separated capture paths (relative to repo root); empty output = nothing to do.

import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--base") opt.base = argv[++i];
  else if (argv[i] === "--head") opt.head = argv[++i];
}
const head = opt.head || "HEAD";

function git(args) {
  const r = spawnSync("git", args, { encoding: "utf8" });
  if (r.status !== 0) {
    process.stderr.write(`new-captures.mjs: git ${args.join(" ")} failed: ${r.stderr}\n`);
    process.exit(1);
  }
  return r.stdout;
}

// A capture: directly under _inbox/, .md, not the schema/template/placeholder files.
const SCHEMA_FILES = new Set(["_inbox/_TEMPLATE.md", "_inbox/README.md", "_inbox/.gitkeep"]);
function isCapture(path) {
  if (!path.startsWith("_inbox/")) return false;
  if (path.slice("_inbox/".length).includes("/")) return false; // only direct children
  if (!path.endsWith(".md")) return false;
  if (SCHEMA_FILES.has(path)) return false;
  return true;
}

let changed;
if (opt.base && /^[0-9a-f]{7,40}$/i.test(opt.base) && opt.base !== "0".repeat(40)) {
  // Added (A) or Modified (M) between base and head; ignore Deleted (D) and Renamed-source.
  changed = git(["diff", "--name-only", "--diff-filter=AM", `${opt.base}..${head}`]);
} else {
  // No usable base (first push to a branch, or all-zero base sha): fall back to whatever
  // capture files currently exist in _inbox/ at head. Better to classify all present captures
  // than to silently do nothing on the very first push.
  changed = git(["ls-tree", "-r", "--name-only", head, "--", "_inbox/"]);
}

const captures = changed
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean)
  .filter(isCapture)
  .sort();

process.stdout.write(captures.join("\n") + (captures.length ? "\n" : ""));
