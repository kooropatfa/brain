# Capture schema v1 (the `_inbox/` contract)

Every capture is `_inbox/<source>-<YYYY-MM-DD-HHMM>.md`: a YAML frontmatter block + a raw body. This is
the one shape every source uses, so the classifier never special-cases a source. The validator is
`<plugin>/tools/classifier/context.mjs` — run it before contributing.

## Filename
```
<source>-<YYYY-MM-DD-HHMM>.md
```
- Validated by the regex **`^[a-z]+-\d{4}-\d{2}-\d{2}-\d{4}\.md$`**, and the prefix MUST equal the
  `source` field.
- `<YYYY-MM-DD-HHMM>` is **UTC**, derived from `captured` (date + 24h time, no separators in the time:
  `1400` for 14:00).
- **Collision = bump the minute.** A disambiguator suffix (`meet-…-1400-standup.md`) FAILS the regex
  (the trailing `-standup` breaks `\d{4}\.md$`). The `_inbox/README.md` example suggesting a suffix is
  not what the validator accepts — use a different minute instead.

## Frontmatter

### Required — on every capture (non-empty)
| field | type | meaning |
|---|---|---|
| `source` | enum | `manual` \| `meet` \| `slack` \| `email` \| `other`. Matches the filename prefix. |
| `captured` | ISO-8601 UTC | The instant the material was captured (meeting happened / note taken), not when typed up. Filename timestamp derives from this. Regex: `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$`. |
| `title` | string | One plain-language line: what this capture *is*. The classifier's strongest single hint — never empty. |

### Source-specific — include only when truthfully fillable
| field | applies to | meaning |
|---|---|---|
| `participants` | meet, slack, email | who was involved (list of names/handles). Omit for a solo manual note. |
| `channel` | slack, email | Slack channel (`#product`) or email routing hint (`from Acme sales`). |
| `file` | meet | the artifact this was exported from (transcript filename/link) for traceability. |

Presence is signal; absence is **not** an error. An empty or fabricated field is worse than an absent
one — it misleads the classifier.

### Optional — fill when known
| field | meaning |
|---|---|
| `source_detail` | clarifies `source`; **REQUIRED when `source: other`**. |
| `hint` | non-binding steer: a dimension (`technical`/`business`/`product`/`design`/`user`) or a free phrase. The classifier may override. Blank if unsure (a wrong hint is inherited). |
| `tags` | loose keywords for search/backlinks, e.g. `[pricing, churn]`. |

### The body — raw, verbatim
Everything below the frontmatter is the capture itself, **unedited**. Do not pre-distil, summarise, or
reorganise — that's the classifier's job. Paste the transcript / note / thread as-is.

## Deriving `captured` and the filename stamp (mirror the m5 normalizer)
```js
const capturedISO = new Date(iso).toISOString().replace(/\.\d{3}Z$/, "Z");   // second precision, ...Z
const d = new Date(capturedISO);
const p2 = n => String(n).padStart(2, "0");
const stamp = `${d.getUTCFullYear()}-${p2(d.getUTCMonth()+1)}-${p2(d.getUTCDate())}-${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}`;
const filename = `${source}-${stamp}.md`;
```

## Self-validate before contributing
```bash
node "<plugin>/tools/classifier/context.mjs" --repo "$BRAIN" --capture "_inbox/<file>.md"
```
Emits a JSON "context pack". Check:
- `"schema_ok": true` and `"schema_violations": []` → good to contribute.
- non-empty `schema_violations` → fix them (the strings name the breach: bad filename, missing required
  field, `captured` not ISO-UTC, `source: other` without `source_detail`, prefix≠source, …).

## Attachments
Binaries (PDF, screenshot, image) go in `"$BRAIN/_attachments/"` (the vault's `attachmentFolderPath`)
and are referenced from the body with `[[_attachments/<file>]]`. Keep the capture body textual; the
attachment is the artifact, the body frames it.
