# tools/classifier — the ingestion Action's brain

When a raw capture lands in `_inbox/`, the ingestion GitHub Action
(`.github/workflows/ingest.yml`) runs Claude headless to classify it, distil it into a clean note,
file it under the right dimension with `[[cross-links]]`, remove it from `_inbox/`, open a PR, and
create follow-up issues. This folder is the part of that pipeline the Action *reads* — its brain.

## Files

| File | Role |
|------|------|
| **`PROMPT.md`** | The classifier spec/prompt. The single source of truth for *how* to classify: dimension choice, ADR-vs-spec-vs-research, distillation, `[[cross-linking]]`, superseding, one-issue-per-action-item, and the "open the PR, never merge" rule. The Action injects this as the headless prompt. |
| **`context.mjs`** | The deterministic half. Reads the dimension set from `brain.config.yml` (never hardcoded), parses a capture's frontmatter against m2's `_inbox` schema v1, flags violations, resolves on-disk filing targets, and emits one JSON **context pack** the prompt consumes. Pure Node, zero deps. |
| **`new-captures.mjs`** | Given a push's `before..after` git range, prints the `_inbox/` capture files that were added/modified — excluding `_TEMPLATE.md`, `README.md`, `.gitkeep`, and nested files. The Action runs this so the classifier processes exactly the new captures, never re-ingesting the whole dock. |
| **`test.mjs`** | Asserts `context.mjs` (real m2 captures validate clean; broken fixtures caught) and `new-captures.mjs` (added capture detected, schema edits/nested files excluded, all-zero-base fallback). Runs under bare `node`, no install. CI gate. |
| **`package.json`** | `npm test` → `test.mjs`; `npm run context` → `context.mjs`. |

The workflow that wires these together lives at **`.github/workflows/ingest.yml`** — it fires on a push
to `_inbox/**`, detects new captures (`new-captures.mjs`), builds the prompt (`PROMPT.md` + a
`context.mjs` pack per capture), and runs the Claude CLI headless
(`claude -p --bare --model claude-opus-4-8 --permission-mode bypassPermissions --max-budget-usd 5`)
to file the note, open the PR, and create follow-up issues. (It deliberately does **not** use the
`claude-code-action` marketplace action — that action rejects `push` events.)

## Design rules (don't break these)

- **Config-driven, never hardcoded.** Dimensions, company, and repo come from `brain.config.yml`
  (`config_driven` quirk). To run this Brain for another project you edit that file — not this code.
- **Consume m1 + m2, don't redefine.** Dimension folders are m1's; the `_inbox` schema is m2's.
  `context.mjs` reads both; if a capture's schema genuinely under-determines a dimension, that's a
  "fix the structure, not the classifier" signal → open a thread to m2, don't guess in code.
- **The PR + issues ARE the notification.** The Action never merges; a human steward reviews
  (`promote: ask-each-time`).

## Run locally

```sh
# context pack for one capture (what the Action feeds the classifier):
node tools/classifier/context.mjs --repo . --capture _inbox/meet-2026-06-09-1400.md

# config + filing targets only:
node tools/classifier/context.mjs --repo .

# tests:
node tools/classifier/test.mjs
```
