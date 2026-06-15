// normalize.test.mjs — contract guard for the m2 schema-v1 capture builder.
// Run: node --test integrations/n8n/normalize.test.mjs   (Node >= 18, zero deps)
//
// These tests pin the exact shape m3's classifier consumes. If m2 ever evolves the schema (via the
// thread they invited), update _inbox parsing expectations here in lock-step.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildCapture, stampFromISO } = require("./normalize.js");

test("filename stamp is UTC <YYYY-MM-DD-HHMM>, matching m2 convention", () => {
  assert.equal(stampFromISO("2026-06-09T14:00:00Z"), "2026-06-09-1400");
  // minute precision, zero-padded
  assert.equal(stampFromISO("2026-01-02T03:04:05Z"), "2026-01-02-0304");
  // a non-UTC offset is normalized to UTC before stamping
  assert.equal(stampFromISO("2026-06-09T16:00:00+02:00"), "2026-06-09-1400");
});

test("happy path: full meet payload → schema-v1 capture", () => {
  const out = buildCapture({
    transcript: "[14:00] Alice: We're recording.\n[14:01] Bob: Per-workspace pricing it is.",
    captured: "2026-06-09T14:00:00Z",
    title: "Pricing review",
    participants: ["Alice", "Bob", "Carol (sales)"],
    file: "Meet Recordings/2026-06-09 Pricing review.transcript.txt",
    tags: ["pricing", "workspaces"],
  });

  assert.equal(out.filename, "meet-2026-06-09-1400.md");
  assert.equal(out.path, "_inbox/meet-2026-06-09-1400.md");

  // Required fields present
  assert.match(out.content, /^---\nsource:    meet\n/);
  assert.match(out.content, /\ncaptured:  2026-06-09T14:00:00Z\n/);
  assert.match(out.content, /\ntitle:     "Pricing review"\n/);
  // Source-specific present because truthful
  assert.match(out.content, /\nparticipants: \[Alice, Bob, "Carol \(sales\)"\]\n/);
  assert.match(out.content, /\nfile:      "Meet Recordings\/2026-06-09 Pricing review.transcript.txt"\n/);
  assert.match(out.content, /\ntags:      \[pricing, workspaces\]\n/);
  // Frontmatter closes, then exactly one blank line, then the verbatim body
  assert.match(out.content, /---\n\n\[14:00\] Alice: We're recording\.\n/);
  // Body is NOT pre-distilled — second line survives verbatim
  assert.match(out.content, /\[14:01\] Bob: Per-workspace pricing it is\.\n$/);
});

test("source-specific fields are omitted when not truthfully fillable", () => {
  const out = buildCapture({
    transcript: "solo voice memo transcribed",
    captured: "2026-06-09T09:00:00Z",
    title: "Quick voice note",
    participants: [],
    tags: [],
  });
  assert.doesNotMatch(out.content, /participants:/);
  assert.doesNotMatch(out.content, /\nfile:/);
  assert.doesNotMatch(out.content, /\ntags:/);
  // but required fields still there
  assert.match(out.content, /source:    meet/);
  assert.match(out.content, /title:     "Quick voice note"/);
});

test("missing title is derived (never empty — it's the classifier's strongest hint)", () => {
  const out = buildCapture({
    transcript: "Standup: shipped the invite flow, blocked on design review.",
    captured: "2026-06-09T10:15:00Z",
  });
  assert.match(out.content, /title:     "Meeting transcript — Standup: shipped the invite flow.*"/);
});

test("rejects a missing/empty transcript", () => {
  assert.throws(() => buildCapture({ captured: "2026-06-09T10:00:00Z" }), /transcript/);
  assert.throws(() => buildCapture({ transcript: "   ", captured: "2026-06-09T10:00:00Z" }), /transcript/);
});

test("rejects a missing/invalid captured timestamp", () => {
  assert.throws(() => buildCapture({ transcript: "x" }), /captured/);
  assert.throws(() => buildCapture({ transcript: "x", captured: "not-a-date" }), /captured/);
});

test("YAML special chars in title/participants are quoted/escaped safely", () => {
  const out = buildCapture({
    transcript: "x",
    captured: "2026-06-09T12:00:00Z",
    title: 'Q3 "growth" review: pricing & churn',
    participants: ["Bob: PM", "O'Brien"],
  });
  // title quotes are escaped
  assert.match(out.content, /title:     "Q3 \\"growth\\" review: pricing & churn"/);
  // participant with a colon/space is quoted in the flow seq
  assert.match(out.content, /participants: \["Bob: PM", "O'Brien"\]/);
});
