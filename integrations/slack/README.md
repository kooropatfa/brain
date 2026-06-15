# Slack → `_inbox/` — the non-technical feeding channel

Lets anyone in the company (sales, design, product — no terminal, no Claude Code, no GitHub account)
feed the Brain from where they already live: **Slack**. A message becomes a schema-v1
`_inbox/slack-<ts>.md` capture and fires the same ingestion Action (`ingest.yml`) as a Meet transcript.

This reuses m5's relay almost verbatim — same Railway n8n instance, same GitHub Contents-API credential,
same `Webhook → Code → PUT → Respond` skeleton. Only the **front half** (Slack instead of Apps Script)
and the **field mapping** change. The mapping logic lives in `integrations/n8n/slack-normalize.js`
(unit-tested by `slack-normalize.test.mjs`, byte-pinned to the real `_inbox/slack-2026-06-09-1155.md`).

## End-user experience (zero install, identical on every OS)
1. **Message shortcut (primary):** hover any Slack message → `...` overflow → **“Add to the Brain.”**
   A small modal opens with a prefilled, editable **title**, an optional **hint** dropdown
   (technical / business / product / design / user / *let it decide*), and a read-only preview of the body.
   Submit → an ephemeral *“Saved — a review PR will open shortly.”*
2. **Emoji fallback:** react to a message with **:brain:** → same capture, title auto-derived from the
   first line (lower quality, zero friction).

The modal forcing a non-empty title is the key move: it captures the one field the classifier most needs,
turning messy Slack prose into a valid capture without the user ever seeing the word "schema."

## Slack app config (one-time, by an admin)
- Create a Slack app **“Brain”** in the Your Company workspace.
- **Interactivity & Shortcuts:** Request URL = the n8n webhook `https://<n8n-host>/webhook/slack-to-inbox`.
  Add a **message shortcut** "Add to the Brain" (callback id `add_to_brain`).
- **Event Subscriptions** (for the emoji fallback): subscribe to `reaction_added`; same Request URL.
- **Scopes (bot token, read-only):** `commands`, `users:read` (resolve author name), `channels:read` +
  `groups:read` (resolve channel name), and `files:read` only if/when attachments ship (phase 2).
- Note the **Signing Secret** and **Bot Token** → set them as n8n service vars (below).

## How a Slack message maps to a capture (`slack-normalize.js`)
| capture field | from Slack |
|---|---|
| `source` | constant `slack` |
| `captured` | the **source message ts** → ISO-8601 UTC (`isoFromSlackTs`), *not* the submit time |
| `title` | the modal title input (trimmed); else first non-empty line → `Slack note — …` (never empty) |
| `participants` | `[author real name]` via `users.info` (omitted if unknown) |
| `channel` | `"#<name>"` via `conversations.info` (omitted for DMs/unknown) |
| `hint` | modal dropdown; `let it decide`/`auto` → omitted; a dimension renders bare, free phrase is quoted |
| body | the raw message text **verbatim** (a thread = parent + replies, each `author: text`) |

Filename `slack-<YYYY-MM-DD-HHMM>.md` from `captured`. The PUT to
`/repos/your-org/brain/contents/_inbox/slack-<ts>.md` (`branch: main`, create-only) touches
`_inbox/**` → fires `ingest.yml`.

## The n8n workflow (`integrations/n8n/slack-to-inbox.workflow.json`)
A near-clone of `meet-to-inbox.workflow.json`, four nodes:
1. **Webhook** `/webhook/slack-to-inbox` — receives the `view_submission` / `reaction_added` payload.
2. **Code** — runs the `slack-normalize.js` body inline (kept in lock-step with the file via the test).
3. **HTTP Request** — `PUT` the base64 capture via the GitHub Contents API (reuse m5's credential).
4. **Respond** — ack Slack (clear the modal / ephemeral message via `response_url`).

## Required hardening (do NOT skip — these are the difference between "demo" and "safe")
1. **Verify the Slack signature.** The webhook is public. Reject anything whose
   `X-Slack-Signature` ≠ `v0=` HMAC-SHA256 of `v0:<X-Slack-Request-Timestamp>:<raw body>` keyed by the
   Signing Secret, and reject timestamps older than 5 minutes (replay). This *replaces* m5's shared-secret check.
2. **Close the failure loop, not just success.** On any error (bad signature, GitHub 4xx, lookup failure)
   post an ephemeral *“Couldn't save that — try again or ping #brain-help.”* A non-dev can't see logs or
   GitHub; silent loss is the worst outcome and quietly erodes trust that the Brain remembers.
3. **Handle same-minute collisions automatically.** Two people capturing in the same minute → the
   create-only PUT 409/422s on a duplicate `slack-YYYY-MM-DD-HHMM.md`. Retry **inside the workflow** with
   a `-2`/`-3` … minute-suffix variant or the message-ts — never drop the second capture, never make it a manual fix.
4. **Be honest in the ack.** *“Saved — it'll be reviewed and added to the Brain shortly”* — NOT
   "auto-merged." Ingestion takes minutes and a **human merges** every ingest PR today (`REVIEW_DRY_RUN=1`).

## Service vars (n8n, on the existing Railway instance)
`SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN` (for `users.info`/`conversations.info`), and reuse m5's
`GITHUB token` credential + `BRAIN_REPO`/`BRAIN_BRANCH`. No new host, no new GitHub token.

## Who reviews / spam
Unchanged from the rest of the pipeline: the capture opens an `Ingest:` PR; a human dimension steward
merges it. The deliberate shortcut/modal gesture (a person picks the message) is the first spam filter;
the human PR review is the backstop. Optionally rate-limit per user in the Code node.

## Outbound: review-channel notifications ("new knowledge awaits approval")
The reverse direction of this integration: a dedicated Slack channel is pinged whenever knowledge is
**waiting on a human** — an `Ingest:` PR is open (`:brain: New knowledge awaits approval`), or such a
PR carries the `needs-human` label (`:warning: Knowledge needs a human decision`, quoting the agent's
questions from the PR body). Implementation: `.github/workflows/notify-slack.yml` runs
`tools/notifier/notify-slack.mjs` — a stateless scan of open ingestion PRs with marker-label dedup
(`slack-notified` / `slack-notified-escalation`), triggered off `workflow_run` of the ingest + review
workflows (bot PRs don't fire `pull_request` — same loop-prevention review-ingest.yml documents) plus
`pull_request` for human-driven cases.

**Setup (one-time, by an admin):**
1. Create the review channel (e.g. `#brain-review`).
2. In the existing **“Brain”** Slack app: *Incoming Webhooks* → activate → **Add New Webhook to
   Workspace** → pick the channel. (Webhooks are channel-bound; no new scopes needed.)
3. Save the webhook URL as the repo secret **`SLACK_WEBHOOK_URL`**
   (`Settings → Secrets and variables → Actions`).

No secret set = the workflow exits silently — notifications are strictly additive and can never fail
or block the pipeline.

## Scope
- **Phase 1 (this):** message shortcut + modal + emoji fallback → text capture. No attachments
  (`_attachments/` + an `attachments:` frontmatter key would be inventing schema v1 — defer).
- **Phase 2 (deferred):** attachments (download Slack files via `files.info`, PUT to `_attachments/`);
  a Workflow-Builder no-code variant for app-install-restricted users; `email → _inbox`.

## Verify
- Offline: `node --test integrations/n8n/slack-normalize.test.mjs` (byte-pinned to the real fixture).
- Live: one real shortcut → a real `_inbox/slack-*.md` (validate `schema_ok: true` with
  `node tools/classifier/context.mjs --capture <file>`) → a real `Ingest:` PR. Then test a *bad* signature
  → expect the ephemeral failure message, no capture written.
