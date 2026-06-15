// slack-normalize.test.mjs — contract guard for the Slack → m2 schema-v1 capture builder.
// Run: node --test integrations/n8n/slack-normalize.test.mjs   (Node >= 18, zero deps)
//
// Pins the exact shape m3's classifier consumes, matching the existing _inbox/slack-2026-06-09-1155.md.
// If m2 evolves the schema, update these expectations in lock-step.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildCapture, stampFromISO, isoFromSlackTs } = require("./slack-normalize.js");

test("filename stamp is UTC <YYYY-MM-DD-HHMM>", () => {
  assert.equal(stampFromISO("2026-06-09T11:55:00Z"), "2026-06-09-1155");
  assert.equal(stampFromISO("2026-06-09T13:55:00+02:00"), "2026-06-09-1155");
});

test("Slack ts → canonical ISO-UTC (seconds part only)", () => {
  // 1749470100 = 2025-06-09T11:55:00Z ... use a known epoch for determinism
  const iso = isoFromSlackTs("1717934100.123456");
  assert.match(iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.doesNotMatch(iso, /\.\d{3}Z$/); // no milliseconds
});

test("happy path: Slack thread payload → schema-v1 slack capture (matches the real fixture shape)", () => {
  const out = buildCapture({
    text: "Erin: users want a dark mode in the mobile app\nBob: +1, comes up in support too.",
    captured: "2026-06-09T11:55:00Z",
    title: "Erin: users want a dark mode in the mobile app",
    participants: ["Erin Acker"],
    channel: "#product-feedback",
    hint: "design",
    tags: ["mobile", "dark-mode", "feature-request"],
  });

  assert.equal(out.filename, "slack-2026-06-09-1155.md");
  assert.equal(out.path, "_inbox/slack-2026-06-09-1155.md");

  // Required fields
  assert.match(out.content, /^---\nsource:    slack\n/);
  assert.match(out.content, /\ncaptured:  2026-06-09T11:55:00Z\n/);
  assert.match(out.content, /\ntitle:     "Erin: users want a dark mode in the mobile app"\n/);
  // Source-specific present because truthful
  assert.match(out.content, /\nparticipants: \["Erin Acker"\]\n/);
  assert.match(out.content, /\nchannel:   "#product-feedback"\n/);
  // hint that IS a dimension is rendered bare
  assert.match(out.content, /\nhint:      design\n/);
  assert.match(out.content, /\ntags:      \[mobile, dark-mode, feature-request\]\n/);
  // verbatim body after exactly one blank line
  assert.match(out.content, /---\n\nErin: users want a dark mode in the mobile app\n/);
  assert.match(out.content, /Bob: \+1, comes up in support too\.\n$/);
});

test("captured derived from Slack ts when not supplied", () => {
  const out = buildCapture({ text: "hello", ts: "1717934100.000100" });
  assert.match(out.content, /\ncaptured:  \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\n/);
  assert.match(out.filename, /^slack-\d{4}-\d{2}-\d{2}-\d{4}\.md$/);
});

test("source-specific fields omitted when not truthfully fillable", () => {
  const out = buildCapture({
    text: "a lone note pasted from a DM",
    captured: "2026-06-09T09:00:00Z",
    title: "DM note",
    participants: [],
    channel: "",
    tags: [],
  });
  assert.doesNotMatch(out.content, /participants:/);
  assert.doesNotMatch(out.content, /\nchannel:/);
  assert.doesNotMatch(out.content, /\nhint:/);
  assert.doesNotMatch(out.content, /\ntags:/);
  assert.match(out.content, /source:    slack/);
});

test("hint 'let it decide' / 'auto' is dropped; free-phrase hint is quoted", () => {
  const a = buildCapture({ text: "x", captured: "2026-06-09T12:00:00Z", title: "t", hint: "let it decide" });
  assert.doesNotMatch(a.content, /\nhint:/);
  const b = buildCapture({ text: "x", captured: "2026-06-09T12:00:00Z", title: "t", hint: "pricing strategy" });
  assert.match(b.content, /\nhint:      "pricing strategy"\n/);
});

test("missing title is derived (never empty)", () => {
  const out = buildCapture({ text: "we should sunset the v1 feed endpoint after June", captured: "2026-06-09T10:15:00Z" });
  assert.match(out.content, /title:     "Slack note — we should sunset the v1 feed endpoint after June"/);
});

test("rejects missing/empty text and missing timestamp", () => {
  assert.throws(() => buildCapture({ captured: "2026-06-09T10:00:00Z" }), /text/);
  assert.throws(() => buildCapture({ text: "   ", captured: "2026-06-09T10:00:00Z" }), /text/);
  assert.throws(() => buildCapture({ text: "x" }), /ts|captured/);
  assert.throws(() => buildCapture({ text: "x", captured: "not-a-date" }), /captured/);
});

test("YAML special chars are escaped/quoted safely", () => {
  const out = buildCapture({
    text: "x",
    captured: "2026-06-09T12:00:00Z",
    title: 'Q3 "growth": pricing & churn',
    participants: ["Bob: PM", "O'Brien"],
    channel: "#sales-eu",
  });
  assert.match(out.content, /title:     "Q3 \\"growth\\": pricing & churn"/);
  assert.match(out.content, /participants: \["Bob: PM", "O'Brien"\]/);
  assert.match(out.content, /channel:   "#sales-eu"/);
});
