# What happens after a capture lands (the ingestion pipeline)

You drop a capture into `_inbox/` and push (via `brain-sync contribute`). From there the pipeline is
automatic — two GitHub workflows in the Brain repo. This is what to expect, so you can set the user's
expectations and not duplicate the work.

## Stage 1 — the ingestion Action (`.github/workflows/ingest.yml`)
- **Trigger:** `push` to the **default branch only** touching `_inbox/**`, or manual
  `workflow_dispatch`. Main-only on purpose: firing on every branch would mass-ingest whatever sits
  in `_inbox/` on each new contribute branch's first push. A capture pushed on a `brain-sync` branch
  is ingested when its `Capture:` PR merges to main.
- **What it runs:** Claude headless via the CLI — `claude -p --bare --model claude-opus-4-8
  --max-budget-usd 5` (not the marketplace `claude-code-action`, which rejects `push` events) — with a
  per-capture deterministic **context pack** from `tools/classifier/context.mjs` and the classifier spec
  `tools/classifier/PROMPT.md`. Allowed tools: `Read,Write,Edit,Glob,Grep,Bash(node:*),Bash(git:*),Bash(gh:*)`.
- **What it produces, per capture:**
  1. Classifies the capture into exactly one **dimension** (config-driven; may override your `hint`).
  2. Decides the note **kind**: ADR (a decision) → `decisions/`; spec or research/note → the dimension
     folder.
  3. Distils a clean note (faithful, not creative) with frontmatter + `[[cross-links]]`.
  4. Adds a one-line **MOC backlink** to the dimension's `index.md` (additive — never restructures).
  5. **Removes the capture from `_inbox/`** (its content now lives in the distilled note).
  6. Opens a PR on branch `ingest/<slug>` titled `Ingest: <title>` (draft if a schema violation or a
     judgment call), explaining the dimension/kind choice and any flags.
  7. Files **one follow-up GitHub issue per genuine action item** (zero if the capture has none).
- **The PR + issues ARE the notification.** The Action never merges.

## Stage 2 — the structural reviewer (`.github/workflows/review-ingest.yml`, ADR-0002)
- **Trigger:** `workflow_run` after the ingestion Action completes (not `pull_request` — bot PRs don't
  fire that). Runs the reviewer file **from the default branch**, so a bot PR can't ship a reviewer that
  approves itself.
- **Scope:** only `ingest/*` branches authored by `github-actions[bot]`. Human/feature PRs are never
  touched (they keep `promote: ask-each-time`).
- **What it does:** runs a deterministic, **AI-free** validator (`tools/reviewer/validate-ingest.mjs`)
  that checks the diff matches the exact known-safe shape — 1 capture deletion, 1 new note, ≥1 additive
  MOC backlink, 0-or-1 frontmatter-only supersede flip — and that no confidence flag was raised in the
  PR body. Verdict JSON: `{decision: "merge" | "escalate", checks[], summary}`. **Defaults to escalate**
  — anything it can't prove safe goes to a human.
- **`merge`** → approve + squash-merge + delete branch — the default behavior for clean PRs (a
  Brain can opt out, see below).
- **`escalate`** → adds `needs-human` + `ingestion` labels and a "request changes" review naming the
  exact failing checks.

> **Auto-merge is on by default.** Out of the box the reusable workflow runs with
> `REVIEW_DRY_RUN=0`: on a `merge` verdict it **approves + squash-merges** the clean PR; only
> `escalate` verdicts go to a human. A Brain opts OUT by passing `auto_merge: false` to the reusable
> workflow in its `review-ingest.yml` shim — then a `merge` verdict **comments "🟢 [DRY-RUN] would
> auto-merge"** and a human merges instead. Unless you know this Brain opted out, a clean capture
> auto-merges; either way, anything questionable still waits for a human.

## What this means for your contribution loop
- After `brain-sync contribute`, point the user at the **brain-sync PR** (`Capture: …`) — that's the
  confirmation the capture landed. The Action then opens its own `Ingest: …` PR.
- The distilled note appears in the Brain only after the ingestion PR **merges** (human-merged,
  unless the Brain opted in to auto-merge).
  Re-pull (`brain-sync read`) after merge to pick it up; otherwise next session's preflight catches up.
- You never write the distilled note, file it, create the issues, or merge. The pipeline owns all of it.
