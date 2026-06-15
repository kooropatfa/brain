#!/usr/bin/env node
// tools/brain-init/brain-init.mjs — scaffold a NEW Brain knowledge repo (pure data).
// The engine never lives in the result; it stays in this plugin.
//
//   node tools/brain-init/brain-init.mjs --name mybrain --org <your-github-user> \
//     [--company "Display Name"] [--dimensions "technical:archi & infra,craft:woodworking notes"] \
//     [--ingestion local|action] [--dir <target-dir>]
import fs from "node:fs";
import path from "node:path";

const die = (m) => { console.error("brain-init: " + m); process.exit(1); };
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const TPL = path.join(SCRIPT_DIR, "templates");

const opt = { ingestion: "local" };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const k = argv[i];
  if (k === "--name") opt.name = argv[++i];
  else if (k === "--org") opt.org = argv[++i];
  else if (k === "--company") opt.company = argv[++i];
  else if (k === "--dimensions") opt.dimensions = argv[++i];
  else if (k === "--ingestion") opt.ingestion = argv[++i];
  else if (k === "--dir") opt.dir = argv[++i];
  else die("unknown arg: " + k);
}
if (!opt.name || !/^[a-z0-9._-]+$/.test(opt.name)) die("--name <brain-name> required (lowercase, no spaces)");
if (!opt.org) die("--org <github-org-or-user> required");
if (!["local", "action"].includes(opt.ingestion)) die("--ingestion must be local or action");
if (opt.ingestion === "action" && !fs.existsSync(path.join(TPL, "workflows")))
  die("templates/workflows missing — engine copy incomplete (ingestion: action needs the CI shim templates)");
const company = opt.company || opt.org;
const repo = `${opt.org}/${opt.name}`;
const target = path.resolve(opt.dir || opt.name);
if (fs.existsSync(target) && fs.readdirSync(target).length) die(`${target} exists and is not empty`);

const DEFAULT_DIMS = [
  ["technical", "architecture, backend, clients, infra"],
  ["business", "model, market, pricing, partners"],
  ["product", "what we're building and why; feature specs; roadmap"],
  ["design", "UX principles, flows, design language"],
  ["user", "who they are, what they need, research, feedback"],
];
const dims = opt.dimensions
  ? opt.dimensions.split(",").map((s) => {
      const i = s.indexOf(":");
      return i === -1 ? [s.trim(), ""] : [s.slice(0, i).trim(), s.slice(i + 1).trim()];
    })
  : DEFAULT_DIMS;

// Validate dimension names: they become top-level folders and YAML keys, so reject anything
// that could escape the target dir, clobber fixed infrastructure, or break the config.
const RESERVED = new Set(["_inbox", "_attachments", "decisions"]);
const seen = new Set();
for (const [n] of dims) {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(n))
    die(`invalid dimension name: '${n}' (allowed: lowercase letters, digits, ., _, - ; must start with a letter or digit)`);
  if (RESERVED.has(n)) die(`dimension name '${n}' collides with a fixed infrastructure folder`);
  if (seen.has(n)) die(`duplicate dimension name: '${n}'`);
  seen.add(n);
  if (!path.resolve(target, n).startsWith(target + path.sep))
    die(`dimension name '${n}' resolves outside the target directory`);
}

// Double-quote a value for YAML so blurbs/display names with ':', '#', quotes etc. stay valid.
const q = (s) => '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';

const render = (text) => text
  .replaceAll("{{NAME}}", opt.name)
  .replaceAll("{{REPO}}", repo)
  .replaceAll("{{COMPANY_YML}}", q(company))
  .replaceAll("{{COMPANY}}", company)
  .replaceAll("{{INGESTION}}", opt.ingestion)
  .replaceAll("{{DIMENSIONS_YML}}", dims.map(([n, b]) => `  - name: ${n}\n    blurb: ${q(b)}`).join("\n"))
  .replaceAll("{{DIMENSIONS_TABLE}}", dims.map(([n, b]) => `| **${n}** | ${b} | [[${n}/index]] |`).join("\n"));

function copyRendered(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name), d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyRendered(s, d);
    else if (/\.(md|yml|yaml|json)$/.test(entry.name) || entry.name === ".gitignore")
      fs.writeFileSync(d, render(fs.readFileSync(s, "utf8")));
    else fs.copyFileSync(s, d);
  }
}

copyRendered(path.join(TPL, "skeleton"), target);
const dimTpl = fs.readFileSync(path.join(TPL, "dimension-index.md"), "utf8");
for (const [n, b] of dims) {
  fs.mkdirSync(path.join(target, n), { recursive: true });
  fs.writeFileSync(path.join(target, n, "index.md"),
    render(dimTpl).replaceAll("{{DIM}}", n).replaceAll("{{BLURB}}", b));
}
if (opt.ingestion === "action")
  copyRendered(path.join(TPL, "workflows"), path.join(target, ".github", "workflows"));

console.log(`Brain knowledge repo scaffolded: ${target}  (${repo}, ingestion: ${opt.ingestion})`);
console.log(`
Next steps:
  1. cd ${target} && git init -b main && git add -A && git commit -m "init brain: ${opt.name}"
  2. gh repo create ${repo} --private --source . --push` + (opt.ingestion === "action" ? `
  3. gh secret set ANTHROPIC_API_KEY --repo ${repo}
  4. connect this machine: brain-sync connect --repo ${repo}
  5. bind a project: echo 'use: [${opt.name}]' > <project>/.brains.yml` : `
  3. connect this machine: brain-sync connect --repo ${repo}
  4. bind a project: echo 'use: [${opt.name}]' > <project>/.brains.yml`));
