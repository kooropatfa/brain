// normalize.js — turn an Apps Script POST payload into an m2 schema-v1 `_inbox/` capture.
//
// This is the single piece of real logic in the n8n flow, factored out as a plain, dependency-free
// module so it can be unit-tested in isolation (see normalize.test.mjs) AND pasted verbatim into the
// n8n "Code" node. The n8n node wrapper at the bottom is commented out; the n8n export embeds the same
// body. Keep this file and the workflow's Code node in lock-step — the test guards the contract.
//
// Contract (owned by m2, frozen as schema v1 — see _inbox/README.md and _inbox/meet-2026-06-09-1400.md):
//   filename:  meet-<YYYY-MM-DD-HHMM>.md         (UTC, derived from `captured`)
//   required:  source: meet | captured (ISO-8601 UTC) | title
//   meet-specific (include only when truthful): participants[] | file
//   optional:  tags[]
//   body:      the raw transcript, VERBATIM — never pre-distilled (distillation is m3's job)
//
// The push of meet-<ts>.md into _inbox/ fires m3's ingest.yml (on: push: paths: ["_inbox/**"]).

"use strict";

/** Pad a number to 2 digits. */
function p2(n) {
  return String(n).padStart(2, "0");
}

/**
 * Derive the `<YYYY-MM-DD-HHMM>` filename stamp (UTC) from an ISO-8601 instant.
 * Mirrors the m2 convention exactly: date + 24h time, no separators inside the time.
 */
function stampFromISO(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`normalize: invalid 'captured' timestamp: ${JSON.stringify(iso)}`);
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
    throw new Error(`normalize: invalid 'captured' timestamp: ${JSON.stringify(iso)}`);
  }
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** YAML-escape a scalar string for a `key: "value"` line (double-quoted). */
function yamlStr(s) {
  return `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Render a YAML flow-sequence of strings: [a, b, "c d"]. Bare when safe, quoted when not. */
function yamlList(items) {
  const parts = items.map((it) => {
    const s = String(it).trim();
    // Quote if it contains anything that would confuse a flow-seq parser.
    return /^[A-Za-z0-9_\-.]+$/.test(s) ? s : yamlStr(s);
  });
  return `[${parts.join(", ")}]`;
}

/**
 * Build the full `_inbox/meet-<ts>.md` file (frontmatter + raw body) from the Apps Script payload.
 *
 * @param {object} payload
 * @param {string} payload.transcript   REQUIRED. The raw transcript text (Markdown export). Verbatim body.
 * @param {string} payload.captured     REQUIRED. ISO-8601 UTC instant the meeting happened (NOT poll time).
 * @param {string} [payload.title]      One-line plain-language title. Falls back to a derived title.
 * @param {string[]} [payload.participants]  Attendee names/handles. Omitted from frontmatter if empty.
 * @param {string} [payload.file]       The source Drive transcript filename or link (traceability).
 * @param {string[]} [payload.tags]     Loose keywords. Omitted if empty.
 * @returns {{ filename: string, content: string, path: string, captured: string }}
 */
function buildCapture(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("normalize: payload must be an object");
  }
  const transcript = payload.transcript;
  if (typeof transcript !== "string" || transcript.trim() === "") {
    throw new Error("normalize: 'transcript' is required and must be a non-empty string");
  }
  if (!payload.captured) {
    throw new Error("normalize: 'captured' (ISO-8601 UTC) is required");
  }

  const capturedISO = canonicalISO(payload.captured);
  const stamp = stampFromISO(payload.captured);

  // `title` is the classifier's strongest single hint — never empty. Derive a sane one if absent.
  let title = (payload.title || "").trim();
  if (!title) {
    const firstLine = transcript.trim().split("\n")[0].replace(/\s+/g, " ").slice(0, 80);
    title = firstLine ? `Meeting transcript — ${firstLine}` : `Meeting transcript (${stamp})`;
  }

  // Source-specific fields: include ONLY when truthfully fillable (m2 rule: an empty/fabricated field
  // is worse than an absent one — it misleads the classifier).
  const participants = Array.isArray(payload.participants)
    ? payload.participants.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const tags = Array.isArray(payload.tags)
    ? payload.tags.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const file = (payload.file || "").trim();

  const fm = ["---", `source:    meet`, `captured:  ${capturedISO}`, `title:     ${yamlStr(title)}`];
  if (participants.length) fm.push(`participants: ${yamlList(participants)}`);
  if (file) fm.push(`file:      ${yamlStr(file)}`);
  if (tags.length) fm.push(`tags:      ${yamlList(tags)}`);
  fm.push("---");

  // Body = raw transcript, verbatim. Exactly one blank line after frontmatter; trailing newline.
  const body = transcript.replace(/\s+$/, "") + "\n";
  const content = `${fm.join("\n")}\n\n${body}`;

  const filename = `meet-${stamp}.md`;
  return { filename, path: `_inbox/${filename}`, content, captured: capturedISO };
}

// ── Node / test export (CommonJS). The n8n Code node uses the body inline; see workflow JSON. ──
if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildCapture, stampFromISO, canonicalISO };
}
