---
title: Decisions — index (MOC)
type: moc
tags: [moc, decisions, adr]
---

# Decisions (ADRs)

> **Map of Content for the `decisions/` folder.** The company's decision log: short, dated,
> immutable records of every significant, hard-to-reverse decision — *what* was decided, *why*,
> and *what was rejected*.

`decisions/` is not a dimension — it is the **trail of reasoning** that cuts across all of them.
When a cross-dimension conflict is resolved (design wants A, business needs B), the resolution and
its rejected alternative are recorded here as an ADR so the reasoning survives and isn't
re-litigated.

## The ADR convention

- **One file per decision:** `ADR-NNNN-short-slug.md` (zero-padded sequence, e.g. `ADR-0001-use-obsidian.md`).
- **Dated and immutable.** An ADR is a point-in-time record. You don't rewrite it.
- **Supersession, not deletion.** When a decision is reversed, write a **new** ADR that supersedes
  the old one and link both ways (`supersedes: [[ADR-0001-...]]` / `superseded_by: [[ADR-00NN-...]]`).
  The trail is never lost.

### Suggested frontmatter

```yaml
---
id: ADR-0001
title: <the decision, as a short statement>
status: proposed | accepted | superseded
date: YYYY-MM-DD
deciders: [<who turned the keys>]
supersedes: []        # ADRs this replaces
superseded_by: []     # filled in when a later ADR replaces this one
tags: [adr]
---
```

### Suggested sections
- **Context** — the forces at play; why a decision was needed.
- **Decision** — what we chose, stated plainly.
- **Consequences** — what becomes easier, what becomes harder.
- **Rejected alternatives** — what we did *not* choose, and why (this is the part that saves
  future re-litigation).

## Decisions
*No ADRs yet — the first decision recorded will appear in this list, newest first.*

<!-- As ADRs are added, link them here, newest first:
- [[ADR-0001-...]] — <one-line summary>
-->

---
*Part of the [[README|Brain]]. Cross-links into the dimensions
([[technical/index]], [[business/index]], [[product/index]], [[design/index]], [[user/index]])
keep each decision tied to what it affects.*
