// slack-normalize.js — turn a Slack interaction payload into an m2 schema-v1 `_inbox/` capture.
//
// Sibling of normalize.js (m5's Meet path). Same shape: a plain, dependency-free module unit-tested in
// isolation (slack-normalize.test.mjs) AND pasted verbatim into the n8n "Code" node. Keep this file and
// the workflow's Code node in lock-step — the test guards the contract. The helper functions
// (p2/stampFromISO/canonicalISO/yamlStr/yamlList) are COPIED from normalize.js, which only exports three
// of them; verify-lockstep can assert byte-equality of the shared helpers if desired.
//
// Contract (owned by m2, frozen as schema v1 — see _inbox/README.md and _inbox/slack-2026-06-09-1155.md):
//   filename:  slack-<YYYY-MM-DD-HHMM>.md        (UTC, derived from `captured`)
//   required:  source: slack | captured (ISO-8601 UTC) | title
//   slack-specific (include only when truthful): participants[] | channel
//   optional:  hint | tags[]
//   body:      the raw message/thread text, VERBATIM — never pre-distilled (distillation is m3's job)
//
// The push of slack-<ts>.md into _inbox/ fires m3's ingest.yml (on: push: paths: ["_inbox/**"]).

"use strict";

/** Pad a number to 2 digits. */
function p2(n) {
  return String(n).padStart(2, "0");
}

/** Derive the `<YYYY-MM-DD-HHMM>` filename stamp (UTC) from an ISO-8601 instant. */
function stampFromISO(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`slack-normalize: invalid 'captured' timestamp: ${JSON.stringify(iso)}`);
  }
  return (
    `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}` +
    `-${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}`
  );
}

/** Normalize an ISO string to the canonical `...Z` second-precision form used across the vault. */
function canonicalISO(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`slack-normalize: invalid 'captured' timestamp: ${JSON.stringify(iso)}`);
  }
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Convert a Slack message ts ("1718000000.123456") to a canonical ISO-UTC instant.
 * Slack ts is seconds-since-epoch with a microsecond suffix; we use the seconds part.
 */
function isoFromSlackTs(ts) {
  const secs = Number(String(ts).split(".")[0]);
  if (!Number.isFinite(secs) || secs <= 0) {
    throw new Error(`slack-normalize: invalid Slack ts: ${JSON.stringify(ts)}`);
  }
  return new Date(secs * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** YAML-escape a scalar string for a `key: "value"` line (double-quoted). */
function yamlStr(s) {
  return `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Render a YAML flow-sequence of strings: [a, b, "c d"]. Bare when safe, quoted when not. */
function yamlList(items) {
  const parts = items.map((it) => {
    const s = String(it).trim();
    return /^[A-Za-z0-9_\-.]+$/.test(s) ? s : yamlStr(s);
  });
  return `[${parts.join(", ")}]`;
}

const DIMENSIONS = ["technical", "business", "product", "design", "user"];

/**
 * Build the full `_inbox/slack-<ts>.md` file (frontmatter + raw body) from a Slack interaction.
 *
 * @param {object} payload
 * @param {string} payload.text         REQUIRED. The raw message/thread text. Verbatim body.
 * @param {string} payload.ts           REQUIRED (or `captured`). Slack message ts of the SOURCE message.
 * @param {string} [payload.captured]   ISO-8601 UTC instant; if absent, derived from `ts`.
 * @param {string} [payload.title]      One-line title (from the modal). Falls back to a derived title.
 * @param {string[]} [payload.participants]  Author name(s)/handle(s). Omitted from frontmatter if empty.
 * @param {string} [payload.channel]    "#channel" or DM context. Omitted if empty.
 * @param {string} [payload.hint]       A dimension name or free phrase. Omitted if empty/"let it decide".
 * @param {string[]} [payload.tags]     Loose keywords. Omitted if empty.
 * @returns {{ filename: string, content: string, path: string, captured: string }}
 */
function buildCapture(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("slack-normalize: payload must be an object");
  }
  const text = payload.text;
  if (typeof text !== "string" || text.trim() === "") {
    throw new Error("slack-normalize: 'text' is required and must be a non-empty string");
  }

  const capturedISO = payload.captured
    ? canonicalISO(payload.captured)
    : isoFromSlackTs(payload.ts);
  const stamp = stampFromISO(capturedISO);

  // `title` is the classifier's strongest single hint — never empty. Derive from the first line if absent.
  let title = (payload.title || "").trim();
  if (!title) {
    const firstLine = text.trim().split("\n")[0].replace(/\s+/g, " ").slice(0, 80);
    title = firstLine ? `Slack note — ${firstLine}` : `Slack note (${stamp})`;
  }

  // Source-specific fields: include ONLY when truthfully fillable.
  const participants = Array.isArray(payload.participants)
    ? payload.participants.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const channel = (payload.channel || "").trim();
  const tags = Array.isArray(payload.tags)
    ? payload.tags.map((x) => String(x).trim()).filter(Boolean)
    : [];

  // hint: a non-binding dimension steer; drop "let it decide" / unknown free text that isn't a dimension
  // is allowed (the schema permits a free phrase), but an empty/sentinel hint is omitted.
  let hint = (payload.hint || "").trim();
  if (hint.toLowerCase() === "let it decide" || hint.toLowerCase() === "auto") hint = "";

  const fm = ["---", `source:    slack`, `captured:  ${capturedISO}`, `title:     ${yamlStr(title)}`];
  if (participants.length) fm.push(`participants: ${yamlList(participants)}`);
  if (channel) fm.push(`channel:   ${yamlStr(channel)}`);
  if (hint) fm.push(`hint:      ${DIMENSIONS.includes(hint) ? hint : yamlStr(hint)}`);
  if (tags.length) fm.push(`tags:      ${yamlList(tags)}`);
  fm.push("---");

  // Body = raw message/thread text, verbatim. Exactly one blank line after frontmatter; trailing newline.
  const body = text.replace(/\s+$/, "") + "\n";
  const content = `${fm.join("\n")}\n\n${body}`;

  const filename = `slack-${stamp}.md`;
  return { filename, path: `_inbox/${filename}`, content, captured: capturedISO };
}

// ── Node / test export (CommonJS). The n8n Code node uses the body inline; see workflow JSON. ──
if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildCapture, stampFromISO, canonicalISO, isoFromSlackTs };
}
