---
title: Ubiquitous Language — glossary
type: glossary
tags: [glossary, ubiquitous-language]
---

# Ubiquitous Language

> The **shared vocabulary** of the company. One agreed definition per term, so humans and AI use
> words the same way across every dimension. When a term here changes meaning, the change ripples
> through every note that links to it — which is exactly why it lives in one place.

This is a **stub**. It starts nearly empty and grows as real terms earn a shared definition. The
rule of thumb: *if two people (or an agent and a person) could reasonably mean different things by a
word, define it here and link to it.* Prefer one canonical term per concept; note synonyms so they
resolve to the same entry.

## How to use it

- **Define a term** with a short, unambiguous entry below (see the shape).
- **Link to it** from anywhere with `[[ubiquitous-language#Term]]` so the definition travels with
  the knowledge and backlinks show every place a term is used.
- **One source of truth.** If a dimension note needs a definition, it links here rather than
  redefining the term locally.

### Entry shape
```
### <Term>
<One or two sentences: what it means here, precisely. Note synonyms and what it is NOT, if useful.>
```

---

## Terms

### Brain
This repository: a Git-versioned folder of plain Markdown that is the single source of truth for
what the company knows and has decided, browsed by humans through Obsidian and read/written by AI
via pull requests. See [[README]].

### Dimension
A top-level folder representing a major lens the company understands itself through
(e.g. [[technical/index|technical]], [[business/index|business]], [[product/index|product]],
[[design/index|design]], [[user/index|user]]). A flexible, extensible set — not a fixed five.

### MOC (Map of Content)
A dimension's `index.md` note: the one obvious door into that dimension, linking out to its
important notes. Every dimension has one.

### ADR (Architecture / Any Decision Record)
A short, dated, immutable note in [[decisions/index|decisions/]] capturing a significant,
hard-to-reverse decision — what was decided, why, and what was rejected. Reversed by a superseding
ADR, never edited away.

### Inbox / loading dock
The `_inbox/` folder where raw, unfiled captures (transcripts, dumps) land before being distilled
and filed into a dimension.

### Capture
A single raw item dropped into `_inbox/` (a meeting transcript, a manual note) awaiting
classification and distillation.

### Steward
The curator (not sole author) of an active dimension: keeps it current, structured, and true;
reviews what gets distilled into it; keeps its cross-links honest.

<!-- Add real terms above as they earn a shared definition. Keep entries short and unambiguous. -->
