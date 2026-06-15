---
# ─────────────────────────────────────────────────────────────────────────────
# _inbox capture — frontmatter schema v1
#
# This is the SINGLE shape every raw capture lands in, whether dropped by a human
# or written by an automated source. The ingestion Action's classifier reads this
# frontmatter + the `raw` body to decide which dimension a capture belongs to,
# distil it, and file it. Keep it filled-in and honest: if a field is a guess,
# the classifier will guess too.
#
# Filename convention (NOT a frontmatter field):  <source>-<YYYY-MM-DD-HHMM>.md
#   e.g.  manual-2026-06-09-1030.md   ·   meet-2026-06-09-1400.md
#   <source> matches the `source` field below; the timestamp matches `captured`.
# ─────────────────────────────────────────────────────────────────────────────

# ── REQUIRED — present on every capture, no exceptions ──────────────────────
source:    manual            # where this came from. One of: manual | meet | slack | email | other
                             #   manual = a person dropped a note by hand
                             #   meet   = an auto-exported meeting/call transcript
                             #   slack  = a Slack message/thread export
                             #   email  = an email or email thread
                             #   other  = anything else; say what in `source_detail`
captured:  2026-06-09T10:30:00Z   # ISO-8601 UTC instant the material was captured (not when written up).
                                  #   The <YYYY-MM-DD-HHMM> in the filename is derived from this.
title:     ""                # one human-readable line — what this capture IS, in plain words.
                             #   e.g. "Pricing call with Acme" / "Note: onboarding drop-off idea".
                             #   The classifier uses this as the strongest hint; never leave it empty.

# ── SOURCE-SPECIFIC — include the ones that apply to `source`; omit the rest ──
# Rule of thumb: include a field only if you can fill it truthfully. An empty or
# fabricated field is worse than an absent one (it misleads the classifier).
participants: []             # meet/slack/email: who was involved, as a list of names/handles.
                             #   e.g. [Alice, Bob, "Acme: Carol"]. Omit for a solo manual note.
channel:     ""              # slack: the channel ("#product") or DM context.
                             #   email: a short routing hint ("from Acme sales", "internal #eng list").
file:        ""              # meet: the source artifact this was exported from
                             #   (recording/transcript filename or a link). Lets a reviewer trace it back.

# ── OPTIONAL — fill when known; all safe to omit ────────────────────────────
source_detail: ""            # free text clarifying `source`, required when source: other.
hint:          ""            # author's steer for the classifier IF they have one — a dimension name
                             #   (technical | business | product | design | user) or a free phrase.
                             #   NOT binding; the classifier may override. Leave empty if unsure —
                             #   a blank hint is honest; a wrong hint is a guess the classifier inherits.
tags:          []            # loose keywords for search/backlinks, e.g. [pricing, churn].
---

<!--
The `raw` body. Everything below the frontmatter is the capture itself, verbatim.
Do NOT pre-distil, summarise, or re-organise here — that is the classifier's job
(m3). Paste the transcript, the note, the thread as-is. Fidelity beats tidiness:
the loading dock holds the RAW material; the distilled, cross-linked note lands
in a dimension folder via the ingestion PR.

Replace this comment with the actual captured content.
-->
