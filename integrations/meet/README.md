# Google Meet → `_inbox/` — the capture front-half (Apps Script poller)

This is the **client half** of Brain meeting feed (milestone **m5**). A Google Apps Script
time-trigger polls the organizer's **"Meet Recordings"** Drive folder, exports each new Gemini
transcript Doc as Markdown, and POSTs it to the [n8n flow](../n8n/README.md), which writes
`_inbox/meet-<ts>.md` and thereby fires m3's ingestion Action.

```
Google Meet (record + Gemini notes ON)
   → transcript Google Doc lands in "Meet Recordings" (Drive)
      → [Apps Script: pollMeetRecordings, time trigger every 15 min]
         · export Doc → Markdown
         · build payload {secret, transcript, captured, title, participants?, file}
         · POST → n8n webhook
            → n8n writes _inbox/meet-<ts>.md  →  m3 ingest.yml  →  PR + issues
```

This is the **START path = polling** (deliberate, per the milestone). The event-driven evolution is
designed in [`EVENT-DRIVEN-TARGET.md`](./EVENT-DRIVEN-TARGET.md) — *documented, not built.*

## Files

| File | What it is |
|------|------------|
| `Poller.gs` | The poller: discovery, dedup, Doc→Markdown export, payload build, POST. |
| `Setup.gs` | One-time `setup()` (config) · `installTrigger()`/`removeTriggers()` · `dryRun()` · `resetProcessed()`. |
| `appsscript.json` | Manifest — minimal OAuth scopes (`drive.readonly`, `script.external_request`, `script.scriptapp`). |
| `parse.test.mjs` | Node tests for the pure parsing helpers, against the real m2 example transcript. |
| `EVENT-DRIVEN-TARGET.md` | The Workspace Events → Pub/Sub target architecture (not built). |

## Prerequisites

1. **Gemini meeting notes / transcripts on.** In Google Meet (Workspace), the organizer enables
   "Take notes with Gemini" / transcript. After each call a transcript **Google Doc** is saved to the
   organizer's Drive in a **"Meet Recordings"** folder.
2. **The n8n flow is deployed** (see [`../n8n/README.md`](../n8n/README.md)) and you have its **webhook
   URL** and the **shared secret**.
3. You run this script **as the meeting organizer** (or an account with read access to that folder),
   because the transcripts live in the organizer's Drive.

## Setup (one-time)

1. Go to <https://script.google.com> → **New project**. Name it `brain-meet-poller`.
2. Add the files: paste `Poller.gs` and `Setup.gs` as two script files; open **Project Settings ▸
   "Show appsscript.json manifest"** and replace it with this folder's `appsscript.json`.
   *(Or use [clasp](https://github.com/google/clasp): `clasp create --type standalone`, `clasp push`
   from this folder — `parse.test.mjs` is ignored by clasp.)*
3. Find the **"Meet Recordings" folder id**: open the folder in Drive; the id is the last path segment
   of the URL `…/folders/<FOLDER_ID>`.
4. Edit `setup()` in `Setup.gs` — set `MEET_RECORDINGS_FOLDER_ID`, `N8N_WEBHOOK_URL`
   (`https://<service>.up.railway.app/webhook/meet-transcript`), and `N8N_WEBHOOK_SECRET` (**the same**
   value as the n8n service's `N8N_WEBHOOK_SECRET`). **Run ▸ `setup`** once. Approve the OAuth scopes
   when prompted (Drive read + external requests).
5. **Run ▸ `dryRun`** — it discovers the newest transcript, exports it, and **logs the payload it would
   send (secret redacted) + the `_inbox/meet-<ts>.md` filename** — without POSTing or marking anything.
   Confirm the participants/title look right and the body is the verbatim transcript.
6. **Run ▸ `installTrigger`** — installs a time trigger running `pollMeetRecordings` every 15 minutes.

That's it. From then on every new transcript becomes a capture automatically; the PR m3 opens is the
notification — nobody watches the folder.

## End-to-end smoke test (the milestone's `done_when`)

> *A transcript appearing in "Meet Recordings" results, without manual steps, in a new
> `_inbox/meet-<ts>.md` (matching the m2 schema) committed to the Brain repo, which then triggers the
> m3 Action.*

1. Hold (or simulate) a short Meet with Gemini notes on → a transcript Doc lands in "Meet Recordings".
   *(Simulate without a real call: drop a Google Doc shaped like `_inbox/meet-2026-06-09-1400.md`'s body
   into the folder.)*
2. Within one trigger interval (≤15 min), the poller exports + POSTs it.
3. **Check the Brain repo:** a new commit adds `_inbox/meet-<ts>.md` on `main`. Open it — frontmatter is
   `source: meet` + `captured`/`title`/`participants`/`file`, body is the verbatim transcript.
4. **Check the Action:** m3's `ingest.yml` run fires on that push and opens a PR that files a distilled
   note under a dimension and moves the capture out of `_inbox/`. ✅ end-to-end.

If a step fails: the poller's **Executions** log (Apps Script editor) shows `sent/skipped/failed`; n8n's
**Executions** show the POST + the GitHub PUT response; the GitHub repo's **Actions** tab shows the m3 run.

## Operational notes

- **Dedup:** each Doc is recorded by file id in Script Properties **only after a successful POST**, so a
  transient n8n/GitHub failure retries on the next poll; a duplicate is never sent. `resetProcessed()`
  clears markers if you ever need to re-ingest.
- **`captured` is the meeting instant** (the Doc's created time), not the poll time — so the filename
  timestamp and frontmatter reflect when the meeting happened.
- **Still-growing transcripts** are skipped until they've been untouched for ~3 min, so a half-written
  Doc isn't captured.
- **Title/participants are best-effort.** Participants come from speaker prefixes in the transcript;
  if none are detectable the field is **omitted** (an empty/fabricated field misleads the classifier —
  the m2 rule). `tags` is intentionally left to the classifier (omitted here).
- **Scopes are minimal** — read-only Drive + external requests. The script never writes to Drive and
  holds no GitHub credentials (the GitHub token lives only in n8n).

## Why polling now, events later

The exact trigger (Drive sync / webhook / n8n) was an open question; m5 committed to
the **n8n flow** and ships **polling first** because it needs zero Google Cloud project setup, no
domain-wide delegation, and no public Pub/Sub endpoint to stand up — it works the moment the script has
Drive read + the n8n URL. The event-driven target (sub-minute latency, no polling waste) is the planned
evolution and is fully specified in [`EVENT-DRIVEN-TARGET.md`](./EVENT-DRIVEN-TARGET.md); switching to it
changes **only this front half** — the n8n flow and the `_inbox/` contract stay exactly as they are.
