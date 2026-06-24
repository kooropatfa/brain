---
name: brain
description: >-
  Use at the START of every Codex coding session and whenever knowledge should flow to or from the
  team's Brain knowledge vault repos. Sync each Brain bound by .brains.yml, consult the Brain before
  non-trivial or cross-dimension work, and contribute captures when the user says phrases like "add
  this to the brain", "save this to the brain", "feed the brain", or Polish equivalents like
  "wrzuc to do braina" / "zapisz to w brainie". Also offer to save durable decisions, specs, and
  non-obvious insights when proactive capture is enabled.
---

# Brain for Codex

The Brain is a shared knowledge vault: one Git repo of Markdown notes per team or project, cloned
under `~/.brain/<name>`. This Codex skill uses the same engine tools as the Claude Code plugin:
`brain-sync` for clone/pull/PR, the same `_inbox/` capture schema, and the same ingestion pipeline.

## Quick Start

Use the installed skill path and wrapper:

```bash
SKILL_DIR="${CODEX_HOME:-$HOME/.codex}/skills/brain"
BRAIN_TOOL="$SKILL_DIR/scripts/brain-tool.mjs"
```

1. Resolve the project binding from `.brains.yml` (`use: [<name>]`), walking up from the current
   project; fall back to `~/.config/brains.yml`. If no binding exists, ask which Brain to use and
   write `.brains.yml` unless the user wants session-only use. `use: []` means stand down.
2. At session start, the Codex installer adds a `SessionStart` hook that syncs each bound Brain.
   If hooks are disabled or unavailable, run the fallback manually:
   `node "$BRAIN_TOOL" brain-sync read --brain <name>`.
3. Before non-trivial work, read relevant files under the printed `~/.brain/<name>` path. Start
   from dimension `index.md` files, `decisions/`, and the glossary note.
4. When asked to save knowledge, write a raw capture into `~/.brain/<name>/_inbox/`, validate it,
   then open a Brain PR:
   `BRAIN_AGENT_TRAILER="Co-Authored-By: OpenAI Codex <codex@openai.com>" node "$BRAIN_TOOL" brain-sync contribute --brain <name> --message "Capture: <title>"`.
5. Never merge, approve, or enable auto-merge on Brain PRs. Open the PR and report its URL.

## Binding

Brains are selected per project, never globally:

```yaml
use: [work]
```

- `<project>/.brains.yml` wins; walk up from the current directory.
- `~/.config/brains.yml` is the fallback.
- `use: []` or `use: none` means no Brain for this project.
- If several Brains are bound and the user says "add this to the brain", ask which one unless their
  phrasing makes it clear.

## Reading

Get the path:

```bash
BRAIN=$(node "$BRAIN_TOOL" brain-sync read --brain <name>)
```

Then search/read the vault directly:

```bash
rg -n "<term>" "$BRAIN"/technical "$BRAIN"/business "$BRAIN"/product "$BRAIN"/design "$BRAIN"/user "$BRAIN"/decisions
```

Adjust the folders to the dimensions listed in the Brain's `brain.config.yml`. Read:

- `"$BRAIN/<dimension>/index.md"` for the map of a dimension.
- `"$BRAIN/decisions/"` for ADRs; respect `superseded` status.
- the configured glossary note, usually `"$BRAIN/ubiquitous-language.md"`.

Skip Brain reads for trivia. Use it for non-trivial implementation, product/design/business context,
past decisions, unfamiliar terms, and cross-dimension work.

## Contributing

When the user asks to save something:

1. Read the material first: pasted text, local file, PDF text, email, Slack/Notion link content, or
   screenshot description. Do not summarize away the source material.
2. Choose the true `source`: `manual`, `meet`, `slack`, `email`, or `other`. If `source: other`, add
   `source_detail`.
3. Set `captured` to the material creation time in ISO-8601 UTC, second precision. If unknown, use
   the current time and be honest in the body.
4. Name the file `<source>-YYYY-MM-DD-HHMM.md`; if the minute is taken, bump the minute.
5. Write required frontmatter: `source`, `captured`, `title`; add only truthful source-specific
   fields such as `participants`, `channel`, `file`, `hint`, and `tags`.
6. Put raw body content below the frontmatter. Put binary/source files in `_attachments/` and link
   them from the capture.
7. Validate:
   `node "$BRAIN_TOOL" classifier-context --repo "$BRAIN" --capture "_inbox/<file>.md"`.
   Expect `"schema_ok": true`.
8. Contribute:
   `BRAIN_AGENT_TRAILER="Co-Authored-By: OpenAI Codex <codex@openai.com>" node "$BRAIN_TOOL" brain-sync contribute --brain <name> --message "Capture: <title>"`.
9. Report the PR URL.

In `ingestion: action` Brains, stop after the capture PR; GitHub Actions classify and file the note.
In `ingestion: local` Brains, follow the engine classifier prompt yourself, delete the capture, file
the clean note, and open one `Ingest: <title>` PR with the raw capture in the PR body.

## Proactive Capture

If config has `proactive: true` or no override, offer once when a durable decision, spec, project
context, or non-obvious insight emerges:

> This looks worth keeping. Want me to add it to the Brain?

Do not proactively save without a yes. Skip routine edits, restating existing docs, failed
explorations, and ordinary implementation details.

## Config

Read optional config in this order, later wins:

1. `~/.config/brain.yml`
2. `~/.config/<name>.yml`
3. project `brain.yml`
4. project `<name>.yml`

Relevant knobs: `auto_pull`, `preflight`, `proactive`, `offer_cap`, `dimensions`, `brain_dir`,
`token_env`, and `session_capture`. The Codex installer wires a `SessionStart` sync hook; it does
not wire `SessionEnd` auto-capture yet, so treat `session_capture` as unavailable unless a separate
Codex stop hook has been installed.

## Tool Wrapper

Use `scripts/brain-tool.mjs` instead of assuming where the engine repo lives. It finds the engine via:

1. `$BRAIN_ENGINE_ROOT`
2. the installed skill symlink back into this repo
3. `~/.local/brain-engine`
4. `~/projects/brain`

Supported commands:

```bash
node "$BRAIN_TOOL" brain-sync <args...>
node "$BRAIN_TOOL" classifier-context <args...>
node "$BRAIN_TOOL" classifier-prompt
```

If the wrapper cannot find the engine, tell the user to run the Codex installer from this repo.
