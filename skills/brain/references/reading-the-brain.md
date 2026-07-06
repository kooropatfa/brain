# Reading the Brain

> No Brain yet (no `.brains.yml` binding)? First-run onboarding — connect or create — is SKILL.md §0.5.

brain-sync has **no search**. After `read`, you have the whole vault as Markdown at `$BRAIN` — read it
with the file tools and `grep`. Load only the slice you need into context.

## Layout
```
$BRAIN/
  README.md                  # the tour — read once
  ubiquitous-language.md     # glossary — check before assuming a term's meaning
  technical/  business/  product/  design/  user/     # the 5 dimensions
    index.md                 # each dimension's MOC (Map of Content) — START HERE
    <slug>.md                # distilled specs / research notes
  decisions/
    index.md                 # ADR MOC
    ADR-NNNN-<slug>.md       # decisions, with status: chains
  _inbox/                    # loading dock — RAW pending captures, NOT knowledge to browse
  _attachments/              # binaries (PDFs, screenshots) referenced by notes
```

## Navigation patterns
- **MOC-first.** Open `"$BRAIN/<dimension>/index.md"` to see what lives in that dimension and follow the
  one-line backlinks to specific notes. Don't grep blind when a MOC will route you.
- **Glossary-first for terms.** `grep -i "### <term>" "$BRAIN/ubiquitous-language.md"`. Team words
  (e.g. *Capture*, *Steward*, *Dimension*) have precise meanings here.
- **Cross-dimension question?** A note touching several dimensions is filed under one and `[[linked]]`
  from the others' MOCs — follow the links rather than assuming one folder holds everything.
- **Decisions = source of truth for "what did we choose."** Read `"$BRAIN/decisions/"`. Honor `status:`
  — `proposed` (under discussion), `accepted` (current), `superseded` (history; follow `superseded_by`).
  Never cite a superseded ADR as current.
- **`_inbox/` is not knowledge.** Files there are raw, unclassified, pending. If you find what you need
  only in `_inbox/`, the pipeline hasn't filed it yet — treat it as provisional and consider whether it
  should be contributed/ingested.

## Quick recipes
```bash
BRAIN=$(node "<plugin>/tools/brain-sync/brain-sync.mjs" path --brain <name>)
grep -ril "pricing" "$BRAIN"/{business,product,decisions}      # files mentioning a topic
sed -n '1,40p' "$BRAIN/business/index.md"                       # scan a dimension MOC
ls "$BRAIN/decisions"                                           # list ADRs
grep -l "status: accepted" "$BRAIN"/decisions/ADR-*.md          # current decisions only
```

## When to consult (and when not)
- **Consult** before non-trivial or cross-dimension work; when the user references a past decision/spec;
  when you're about to assert "we decided X" or "the spec is Y."
- **Skip** for trivia, mechanical edits, or anything self-contained in the current repo. A quick MOC +
  glossary pass is usually enough; don't pull the whole vault into context.
