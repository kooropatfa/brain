# tools/reviewer — structural reviewer for ingestion PRs (m7)

When m3's ingestion Action opens a PR (`ingest/<slug>`, authored by `github-actions[bot]`), this is
the automated reviewer that decides whether it's safe to **auto-merge** or must be **escalated to a
human**. It is deterministic and **AI-free** — it does not judge knowledge *quality* (that's the
classifier's job, m3); it enforces *structure* and *data-safety*.

## Files

| File | Role |
|------|------|
| **`validate-ingest.mjs`** | The validator. Given a PR's git diff range + the post-merge tree + the PR body, runs checks C1–C10 and prints one JSON verdict `{decision: "merge"\|"escalate", checks, summary}`. Pure Node, zero deps; reuses `../classifier/context.mjs`'s YAML parser + config reader. **Default-escalate** — anything it can't prove safe goes to a human. |
| **`test.mjs`** | Pure-Node tests (mirrors `tools/classifier/test.mjs`): 3 MERGE cases + one ESCALATE case per check, on throwaway git repos. CI gate. |
| **`.github/workflows/review-ingest.yml`** | The workflow (in `.github/workflows/`): `workflow_run` off the ingest Action → gate to `ingest/*` bot PRs → run the validator → approve+squash-merge OR comment+`needs-human`. |

## The checks (each maps to a data-safety requirement)

| Check | Enforces |
|-------|----------|
| C1 | exactly one `_inbox/` capture removed, no other deletion *(deletions traceable)* |
| C2 | every change is a known-safe pattern; anything else escalates |
| C3 | exactly one new note, in a config dimension or `decisions/` |
| C4 | note frontmatter complete; `dimension ∈ brain.config.yml`; ADR ⟺ `decisions/`; `source_capture` == the deleted capture *(provenance)* |
| C5 | MOC edits are additive-only (only the placeholder removed; backlink bullets added) *(no clobber)* |
| C6 | supersede is frontmatter-only + bidirectional; ADR body immutable *(update only when facts change)* |
| C7 | every `[[link]]` resolves in the post-merge tree |
| C8 | no existing-note body overwritten (C2∧C5∧C6) *(never overwrite/corrupt)* |
| C9 | PR-body confidence flags (`hint overridden` / `under-determined dimension` / `missing prior ADR` / `schema violation`) + draft → escalate |
| C10 | (soft) the deleted capture was schema-valid, or the PR is draft |

The confidence-flag phrases C9 reads are a **contract** with the classifier, documented in
`tools/classifier/PROMPT.md` §7.

## Decision

All checks pass → `gh pr review --approve` + `gh pr merge --squash --delete-branch` (one atomic,
`git revert`-able commit). Any check fails → `needs-human` label + a `request-changes` review naming
the exact failing check; never merged. Governance decision recorded in
`decisions/ADR-0002-auto-merge-ingestion-prs-after-structural-review.md` (overrides `field.yml`
`promote: ask-each-time` for ingestion PRs only).

## Run locally

```sh
# replay against a real ingestion branch:
BASE=$(git merge-base origin/main origin/ingest/<slug>)
node tools/reviewer/validate-ingest.mjs --repo . --base "$BASE" --head origin/ingest/<slug> \
  --pr-body-file /path/to/pr-body.txt [--draft]

# tests:
node tools/reviewer/test.mjs
```
