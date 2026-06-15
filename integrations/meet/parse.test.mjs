// parse.test.mjs — verifies the Apps Script poller's pure parsing helpers against sample transcript
// shapes (the example _inbox/meet-2026-06-09-1400.md). Apps Script's .gs can't run under Node, so
// we re-declare the two pure helpers here verbatim and test them. If Poller.gs changes the regex,
// update this copy in lock-step.  Run: node --test integrations/meet/parse.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

// ── verbatim copies of the pure helpers from Poller.gs / Setup.gs ──
function extractParticipants_(transcript) {
  const seen = {};
  const order = [];
  const lines = transcript.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(?:\[\d{1,2}:\d{2}(?::\d{2})?\]\s*)?([A-Z][\w .'()\-]{1,39}?):\s/);
    if (m) {
      const name = m[1].trim();
      if (/^(Transcript|Notes|Summary|Action items|Attendees|Recording)$/i.test(name)) continue;
      if (!seen[name]) { seen[name] = true; order.push(name); }
    }
    if (order.length >= 25) break;
  }
  return order;
}
function isoToStamp_(iso) {
  const d = new Date(iso);
  const p = (n) => (n < 10 ? "0" : "") + n;
  return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate()) +
    "-" + p(d.getUTCHours()) + p(d.getUTCMinutes());
}

// A sample meeting transcript body (fictional product, neutral cast).
const M2_MEET = `[14:00:12] Alice: Okay, we're recording. Topic is the per-seat pricing pushback.
[14:00:31] Carol (sales): Every multi-team account says the same thing.
[14:01:05] Bob: So the model is upside-down.
[14:01:40] Dave: From the product side, shared logins also break notifications.
[14:02:03] Alice: What's the alternative we keep coming back to?`;

test("extracts distinct speakers in order from a timestamped Gemini transcript", () => {
  const p = extractParticipants_(M2_MEET);
  assert.deepEqual(p, ["Alice", "Carol (sales)", "Bob", "Dave"]);
});

test("handles a transcript with no timestamps (plain 'Name: ...')", () => {
  const p = extractParticipants_("Bob: hi\nAlice: hello\nBob: again");
  assert.deepEqual(p, ["Bob", "Alice"]);
});

test("filters non-speaker section labels", () => {
  const p = extractParticipants_("Attendees: Bob, Alice\n[10:00] Bob: real line\nSummary: stuff");
  assert.deepEqual(p, ["Bob"]);
});

test("returns [] when nothing looks like a speaker (honest empty, not fabricated)", () => {
  const p = extractParticipants_("just some freeform notes with no speaker prefixes at all.");
  assert.deepEqual(p, []);
});

test("isoToStamp_ matches the n8n/m2 UTC filename convention", () => {
  assert.equal(isoToStamp_("2026-06-09T14:00:00Z"), "2026-06-09-1400");
  assert.equal(isoToStamp_("2026-01-02T03:04:05Z"), "2026-01-02-0304");
});
