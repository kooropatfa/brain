# Capture cookbook — one worked example per source type

Each block is a complete, schema-valid capture you can adapt. Filename and `captured` are UTC and must
agree. Self-validate (`node "<plugin>/tools/classifier/context.mjs" --repo "$BRAIN" --capture "_inbox/…"`) before contributing.
Write the file into `"$BRAIN/_inbox/"`, then `contribute --message "Capture: <title>"`.

---

## manual — a hand-written note or a chunk of reasoning
`_inbox/manual-2026-06-09-1030.md`
```markdown
---
source:    manual
captured:  2026-06-09T10:30:00Z
title:     "Idea: surface shared workspaces on a profile to cut onboarding drop-off"
hint:      product
tags:      [onboarding, invites, retention]
---
Users bounce during onboarding. If a profile showed "3 of your workspaces already use X",
the invite stops feeling cold. Not asking anyone to build it yet — capturing the idea.
```
> A reasoning chunk from this very conversation is also `manual`: paste the relevant reasoning verbatim
> into the body. No `participants`/`channel` for a solo note.

---

## meet — a meeting / call transcript
`_inbox/meet-2026-06-09-1400.md`
```markdown
---
source:       meet
captured:     2026-06-09T14:00:00Z
title:        "Pricing review — move accounts from per-seat to per-workspace"
participants: [Alice, Bob, "Carol (sales)", Dave]
file:         "Meet Recordings/2026-06-09 Pricing review.transcript.txt"
tags:         [pricing, packaging, workspaces]
---
[14:00:12] Bob: accounts keep stalling at the per-seat quote…
[14:03:40] Alice: decision's made — we move to per-workspace tiers.
… (full transcript, verbatim) …
```

---

## slack — a thread link
`_inbox/slack-2026-06-09-1155.md`
```markdown
---
source:       slack
captured:     2026-06-09T11:55:00Z
title:        "Erin: users want a dark mode in the mobile app"
participants: [Erin Acker]
channel:      "#product-feedback"
hint:         design
tags:         [mobile, dark-mode, feature-request]
---
Source: https://your-org.slack.com/archives/C0XXXX/p169...

Erin: lots of DMs asking for dark mode — the bright UI is rough at night.
Bob: +1, comes up in support too.
… (paste the thread verbatim; the link is provenance, the pasted text is the material) …
```

---

## slack — a channel link (no single thread)
`_inbox/slack-2026-06-09-1200.md`
```markdown
---
source:   slack
captured: 2026-06-09T12:00:00Z
title:    "Recurring asks in #product-feedback worth a look"
channel:  "#product-feedback"
tags:     [feedback, signals]
---
Channel reference (not a single thread): https://your-org.slack.com/archives/C0XXXX

Summary of what's recurring, with the relevant messages pasted below verbatim…
(Note: this points at a channel, not one thread — `participants` omitted.)
```

---

## email — an email or thread (optionally with a PDF)
`_inbox/email-2026-06-09-0915.md`
```markdown
---
source:       email
captured:     2026-06-09T09:15:00Z
title:        "Acme renewal terms — counter-proposal"
participants: ["Acme: Jordan", Alice]
channel:      "from Acme sales"
tags:         [partners, renewal, pricing]
---
From: jordan@acme.com … (email body verbatim) …

Attached proposal: [[_attachments/acme-renewal-2026-06-09.pdf]]
```
> The PDF goes in `"$BRAIN/_attachments/acme-renewal-2026-06-09.pdf"`. An emailed PDF is `source: email`
> (the true origin), not `other`.

---

## PDF — standalone
`_inbox/manual-2026-06-09-1600.md` (or `email`/`other` per true origin)
```markdown
---
source:        manual
captured:      2026-06-09T16:00:00Z
title:         "Competitor teardown deck — key takeaways"
tags:          [competition, market]
---
Dropped a PDF into the Brain: [[_attachments/competitor-teardown-2026-06.pdf]]

Framing: slides 4–7 cover their onboarding; slide 12 their pricing.
(If extractable, paste the salient text so the classifier has material; else the framing + the file.)
```

---

## other — a Notion link
`_inbox/other-2026-06-09-1330.md`
```markdown
---
source:        other
source_detail: "Notion"
captured:      2026-06-09T13:30:00Z
title:         "Q3 roadmap doc (Notion)"
hint:          product
tags:          [roadmap, planning]
---
https://www.notion.so/acme/Q3-Roadmap-...

(Paste the relevant doc content verbatim if you can read it — a bare link is weak; the classifier
needs material. `source: other` REQUIRES the source_detail above.)
```

---

## other — a screenshot
`_inbox/other-2026-06-09-1745.md`
```markdown
---
source:        other
source_detail: "screenshot"
captured:      2026-06-09T17:45:00Z
title:         "Crash on profile tab — error toast"
hint:          technical
tags:          [bug, mobile, crash]
---
Screenshot: [[_attachments/profile-crash-2026-06-09.png]]

What it shows: red toast "Something went wrong (E-503)" on opening the Profile tab, iOS 17.
(One-line description + the image in _attachments/. Use the true origin as source if known.)
```
