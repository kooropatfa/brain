# n8n — the meeting-capture relay (`meet → _inbox/`)

This is the **server half** of Brain's automated meeting feed (milestone **m5**). It receives
a Google Meet transcript from the [Apps Script poller](../meet/README.md), normalizes it into the
**m2 `_inbox/` schema v1**, and writes `_inbox/meet-<ts>.md` to the Brain repo via the GitHub Contents
API. That commit is a push touching `_inbox/**`, which fires **m3's `ingest.yml`** — the classifier
distils the capture, files it under a dimension, and opens a PR.

```
Google Meet → Gemini transcript Doc in "Meet Recordings" (Drive)
   │
   ▼  (integrations/meet — Apps Script time-trigger, polls + exports Markdown + POSTs)
n8n  (this folder, hosted on Railway)
   ├─ Webhook            receive POST  { secret, transcript, captured, title?, participants?, file?, tags? }
   ├─ Code               check shared secret · normalize → m2 schema-v1 capture · base64 the content
   ├─ HTTP Request       PUT https://api.github.com/repos/<BRAIN_REPO>/contents/_inbox/meet-<ts>.md  (branch: main)
   └─ Respond            201 { ok, path, commit } · or 4xx { ok:false, error }
   │
   ▼  push to _inbox/** on main
m3 ingest.yml → classify → distil → file under dimension → open PR (+ issues)   ← m3 owns this; m5 stops at the capture file
```

## Files

| File | What it is |
|------|------------|
| `meet-to-inbox.workflow.json` | The importable n8n workflow (Webhook → Code → GitHub PUT → Respond). |
| `normalize.js` | The capture builder (m2 schema-v1). Dependency-free; the Code node inlines its body. |
| `normalize.test.mjs` | 7 contract tests pinning the exact shape m3 consumes. `node --test integrations/n8n/normalize.test.mjs` |
| `verify-lockstep.mjs` | Dev guard: proves the workflow's Code node ≡ `normalize.js` and rejects a bad secret. |
| `Dockerfile` | Pinned `n8nio/n8n` image for Railway. |
| `railway.json` | Railway build/deploy config (Dockerfile builder, healthcheck). |
| `.env.example` | Every env var the service needs (shape only — no secrets). |

## The capture it emits (the m2 contract)

The flow produces **exactly** the shape of `_inbox/meet-2026-06-09-1400.md`:

```markdown
---
source:    meet
captured:  2026-06-09T14:00:00Z      # ISO-8601 UTC — the meeting instant, NOT poll time
title:     "Pricing review"          # never empty (classifier's strongest hint); derived if absent
participants: [Alice, Bob, "Carol (sales)"]   # included only when truthfully fillable
file:      "Meet Recordings/2026-06-09 Pricing review.transcript.txt"   # traceability
tags:      [pricing, workspaces]
---

<the raw transcript, VERBATIM — never pre-distilled; distillation is m3's job>
```

Filename `meet-<YYYY-MM-DD-HHMM>.md` (UTC, derived from `captured`). On a same-minute collision the
filename stamp is bumped by a minute — a word suffix would fail the schema validator's filename regex.

> **Contract source of truth:** m2 owns `_inbox/**` and froze schema v1 (`_inbox/README.md`). This flow
> consumes it; it does not redefine it. If a future capture genuinely under-determines a dimension, that
> is a "fix the structure, not the classifier" signal → open a hub thread to m2, don't guess.

## Why Railway (and not Fly.io)

The product backend's hosting comparison decided **Fly.io** — but that decision is about the
**product backend** (Rails + Postgres + Redis + S3), a different, stateful, globally-scaled
workload. It never mentions n8n.

This n8n relay is a **tiny, stateless-ish automation worker**: one webhook, a few seconds of work per
meeting, idle the rest of the time. For that, **Railway is the right host** and is what every m5 source
specifies:

- **Per-second usage billing** — n8n is idle almost always; you pay near-zero between meetings.
- **1-click deploy from a Dockerfile + a 1-click Volume** for `/home/node/.n8n` persistence — no ops.
- **No multi-region need** — a meeting relay has no latency-sensitive global users; the product backend's
  reason for Fly.io (regional DB replicas) does not apply here.

So: **product backend → Fly.io; this automation helper → Railway.** No conflict — two different workloads.

## Railway setup (one-time)

1. **New Railway project** → *Deploy from GitHub repo* → pick the Brain repo. Set the service **Root
   Directory** to the repo root and let it read `integrations/n8n/railway.json` (it points the build at
   `integrations/n8n/Dockerfile`). Or: *Deploy from Dockerfile* pointed at that path.
2. **Add a Volume** mounted at `/home/node/.n8n` so the imported workflow + the GitHub credential survive
   redeploys.
3. **Set service variables** from `.env.example` (Railway → service → Variables). The important ones:
   `N8N_ENCRYPTION_KEY` (stable — generate once: `openssl rand -hex 24`), `N8N_WEBHOOK_SECRET` (same value
   you put in the poller), `BRAIN_REPO=your-org/brain`, `BRAIN_BRANCH=main`, and the n8n basic-auth
   pair. Railway injects `$PORT`.
4. **Deploy.** Open `https://<service>.up.railway.app`, log in with the basic-auth creds.
5. **Import the workflow:** n8n → *Workflows* → *Import from File* → `meet-to-inbox.workflow.json`.
6. **Create the GitHub credential** (next section), attach it to the *GitHub Contents API* node if not
   auto-linked, **Activate** the workflow.
7. **Grab the webhook URL** (the Webhook node shows the production URL,
   `https://<service>.up.railway.app/webhook/meet-transcript`) and put it in the poller config.

## GitHub token (the credential)

The PUT needs write access to the Brain repo's contents — and **nothing more**.

- **Type:** a **fine-grained PAT** (or a GitHub App installation token).
- **Resource owner:** the `your-org` org; **Repository access:** only `your-org/brain`.
- **Permissions:** *Repository permissions → Contents: Read and write*. (No issues/PR/admin scopes — the
  flow only commits a file; m3's Action opens the PR and issues with its own `GITHUB_TOKEN`.)
- **Store it in n8n** as a **Header Auth** credential named `GitHub token (Authorization: Bearer)`:
  - Header name: `Authorization`
  - Header value: `Bearer <TOKEN>`
  n8n encrypts it with `N8N_ENCRYPTION_KEY`; it never touches Git. (See `.env.example` for why it is a
  credential, not a plain env var.)

## Idempotency & safety

- **Dedup is upstream** (the poller tracks processed Drive file IDs in `PropertiesService`), so a transcript
  is POSTed once. As a backstop, the Contents PUT is **create-only**: if the path already exists GitHub
  returns 422/409 and the flow responds 4xx rather than overwriting. (To re-ingest deliberately, the poller
  appends a disambiguator to the filename.)
- **Auth:** the webhook is public, so the Code node rejects any POST without the correct `N8N_WEBHOOK_SECRET`
  (→ 4xx). The GitHub token is least-privilege (Contents-only, single repo).
- **No transcript content is logged** beyond what n8n records for an execution; treat n8n execution history
  as containing meeting content and keep the instance access-controlled (basic auth + a strong password).

## Verify locally (no Railway/creds needed)

```bash
node --test integrations/n8n/normalize.test.mjs   # 7/7 — the m2 contract
node integrations/n8n/verify-lockstep.mjs          # Code node ≡ normalize.js; bad secret rejected
```

A full live smoke-test (real POST → real `_inbox/meet-*.md` commit → real m3 Action) needs the Railway
deploy + the GitHub token; the end-to-end checklist is in [`../meet/README.md`](../meet/README.md).

## Event-driven target (documented, not built)

This START path **polls** (Apps Script time-trigger). The event-driven evolution — Google Workspace Events
API → Pub/Sub push → this same n8n webhook — is specified in
[`../meet/EVENT-DRIVEN-TARGET.md`](../meet/EVENT-DRIVEN-TARGET.md). When that lands, **only the front half
changes** (Pub/Sub replaces the poller); this n8n flow is unchanged — it still receives a POST and writes
the capture. That is the point of putting normalization here.
