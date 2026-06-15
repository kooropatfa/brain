# `_inbox/` — the loading dock

Every raw capture lands here **first**, in one predictable shape, before it is classified and filed
into a dimension. This is the entry point of the ingestion pipeline:

```
talk / note  →  _inbox/<source>-<YYYY-MM-DD-HHMM>.md  →  GitHub Action  →  Claude classifies + distils
              →  files a clean note under the right dimension with [[cross-links]]  →  opens a PR
              →  creates follow-up issues  →  the dimension steward reviews & merges
```

Nothing in `_inbox/` is permanent. A capture is **raw input**; once the Action distils it into a
dimension folder, the ingestion PR moves the original out of `_inbox/`. If you see files piling up
here, the pipeline hasn't run or a PR is waiting for review — not a place to browse for knowledge.

## Filename convention

```
<source>-<YYYY-MM-DD-HHMM>.md
```

- `<source>` — the same value as the `source` frontmatter field: `manual`, `meet`, `slack`, `email`,
  or `other`.
- `<YYYY-MM-DD-HHMM>` — the capture instant in UTC, derived from the `captured` field (date + 24h
  time, no separators inside the time, e.g. `1400` for 14:00).

Examples: `manual-2026-06-09-1030.md`, `meet-2026-06-09-1400.md`, `slack-2026-06-09-0915.md`.

Why this shape: it sorts chronologically within a source, tells a human at a glance where a capture
came from and when, and gives the Action a stable, collision-resistant key. If two captures share a
source and minute, **bump the minute** (`…-1400.md` taken → use `…-1401.md`). Do *not* append a word
suffix — the validator's filename regex rejects it.

## The one frontmatter schema

Manual drops **and** every automated source use the **same** frontmatter, so the classifier never
has to special-case a source. Copy [`_TEMPLATE.md`](./_TEMPLATE.md) and fill it in.

### Required — on every capture

| field      | type        | meaning |
|------------|-------------|---------|
| `source`   | enum        | Origin: `manual` \| `meet` \| `slack` \| `email` \| `other`. Matches the filename prefix. |
| `captured` | ISO-8601 UTC | The instant the material was captured (when the meeting happened / the note was taken), not when it was typed up. The filename timestamp derives from this. |
| `title`    | string      | One plain-language line saying what this capture *is*. The classifier's strongest single hint — never leave it empty. |

### Source-specific — include the ones that apply, omit the rest

| field          | applies to        | meaning |
|----------------|-------------------|---------|
| `participants` | meet, slack, email | Who was involved, as a list of names/handles. Omit for a solo manual note. |
| `channel`      | slack, email       | Routing context — a Slack channel (`#product`) or an email routing hint (`from Acme sales`). |
| `file`         | meet               | The artifact this was exported from (recording/transcript filename or link), so a reviewer can trace it back. |

A source-specific field is included **only when it can be filled truthfully**. An empty or fabricated
field is worse than an absent one — it misleads the classifier. (Manual notes typically carry none of
these.)

### Optional — fill when known, all safe to omit

| field           | meaning |
|-----------------|---------|
| `source_detail` | Free text clarifying `source`; **required when `source: other`**. |
| `hint`          | The author's *non-binding* steer for the classifier: a dimension name (`technical`, `business`, `product`, `design`, `user`) or a free phrase. The classifier may override it. Leave empty if unsure — a blank hint is honest; a wrong hint is a guess the classifier inherits. |
| `tags`          | Loose keywords for search/backlinks, e.g. `[pricing, churn]`. |

### The body — `raw`, verbatim

Everything below the frontmatter is the capture itself, **unedited**. Do not pre-distil, summarise,
or reorganise — that is the classifier's job. Paste the transcript, the note, or the
thread as-is. Fidelity beats tidiness: the dock holds raw material; the clean, cross-linked note is
what the ingestion PR produces in a dimension folder.

## Why the structure is this strict (and not stricter)

The pipeline's rule: **if the classifier is guessing, the structure is too vague — fix the
structure, not the classifier.** So the schema pins down the few
things a classifier genuinely needs — *where it came from* (`source`/`participants`/`channel`) and
*what it is* (`title`/`hint`/`tags`) — and pins down nothing else. The dimension itself is
deliberately **not** a required field: forcing a human to pre-classify would defeat the point of
automatic filing, and a wrong forced answer is worse than none. `hint` exists for the cases where the
author *does* know, without making them decide when they don't.

## How to drop a capture by hand

1. Copy `_TEMPLATE.md` to `<source>-<YYYY-MM-DD-HHMM>.md` (usually `source: manual`).
2. Fill the required frontmatter; add `title`; add a `hint` only if you actually have one.
3. Paste the raw content into the body.
4. Commit & push (the Obsidian Git plugin does this automatically for non-technical contributors).
   The Action fires on the new file; the resulting PR + issues are your notification — you don't have
   to watch anything.

See [`manual-2026-06-09-1030.md`](./manual-2026-06-09-1030.md) and
[`meet-2026-06-09-1400.md`](./meet-2026-06-09-1400.md) for worked examples.
