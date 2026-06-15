// verify-lockstep.mjs — proves the n8n Code-node body produces the SAME capture as normalize.js.
// Not part of the n8n runtime; a dev guard so the inlined node and the tested module never drift.
// Run: node integrations/n8n/verify-lockstep.mjs   (exit 0 = in lock-step)

import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { buildCapture } = require("./normalize.js");
const workflow = require("./meet-to-inbox.workflow.json");

const payload = {
  secret: "test-secret",
  transcript: "[14:00] Alice: We're recording.\n[14:01] Bob: Per-workspace pricing it is.",
  captured: "2026-06-09T14:00:00Z",
  title: "Pricing review",
  participants: ["Alice", "Bob", "Carol (sales)"],
  file: "Meet Recordings/2026-06-09 Pricing review.transcript.txt",
  tags: ["pricing", "workspaces"],
};

// Reference output from the tested module.
const ref = buildCapture(payload);
const refContent = ref.content;

// Extract and run the n8n Code node body in a minimal $input/$env shim.
const codeNode = workflow.nodes.find((n) => n.name === "Normalize → m2 capture");
const jsCode = codeNode.parameters.jsCode;

const $input = { first: () => ({ json: { body: payload } }) };
const $env = { N8N_WEBHOOK_SECRET: "test-secret", BRAIN_REPO: "your-org/brain", BRAIN_BRANCH: "main" };
const runNode = new Function("$input", "$env", "Buffer", jsCode);
const result = runNode($input, $env, Buffer);
const nodeOut = result[0].json;
const nodeContent = Buffer.from(nodeOut.contentB64, "base64").toString("utf8");

// 1. Same rendered file content.
assert.equal(nodeContent, refContent, "Code-node content drifted from normalize.js buildCapture()");
// 2. Same path / filename.
assert.equal(nodeOut.path, ref.path, "path mismatch");
assert.equal(nodeOut.filename, ref.filename, "filename mismatch");
// 3. Repo target is the env var, defaulting to the correct org (not the stale config).
assert.equal(nodeOut.brainRepo, "your-org/brain");
assert.equal(nodeOut.branch, "main");

// 4. The auth check rejects a bad secret.
let threw = false;
try {
  runNode({ first: () => ({ json: { body: { ...payload, secret: "wrong" } } }) }, $env, Buffer);
} catch (e) {
  threw = /shared secret/.test(e.message);
}
assert.equal(threw, true, "bad-secret POST was not rejected");

console.log("lock-step OK — n8n Code node ≡ normalize.js; auth check rejects bad secret");
console.log("--- rendered capture (both paths identical) ---");
console.log(refContent);
