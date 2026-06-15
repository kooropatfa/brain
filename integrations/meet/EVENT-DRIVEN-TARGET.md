# Event-driven target — Workspace Events → Pub/Sub (DESIGN ONLY, not built)

> **Status: documented, not built.** The shipped START path is the Apps Script **poller**
> ([`README.md`](./README.md)). This file specifies the event-driven evolution so it can be built later
> without re-discovery. It is explicitly **out of scope** for milestone m5 — m5's job was to *document*
> this target, not implement it.

## Why evolve past polling

The poller is the right *start* (zero cloud setup, works immediately) but has two inherent costs:

- **Latency:** a transcript waits up to one poll interval (≤15 min) before it's captured.
- **Waste:** the trigger runs on schedule whether or not a meeting happened — mostly empty polls.

The event-driven target removes both: the moment a transcript Doc is created, Google **pushes** an event
to our endpoint, which POSTs to the *same* n8n flow. **Latency drops to seconds; there are no empty
polls.**

## The key property: only the FRONT HALF changes

```
                 ┌─────────────── replaced ───────────────┐
  START (built): Apps Script time-trigger  → poll Drive → export → POST ─┐
                                                                          ├─► n8n webhook → GitHub Contents API → _inbox/meet-<ts>.md → m3 Action
  TARGET (this): Drive change event → Pub/Sub push → tiny handler → POST ─┘
                 └─────────────── replaced ───────────────┘                 └──────────────── UNCHANGED ────────────────┘
```

The n8n flow, the m2 `_inbox/` contract, and m3's Action are **untouched**. That is the whole reason
normalization lives in n8n and not in the poller — the trigger is swappable.

## Architecture

Two Google surfaces can deliver the event; both terminate in a Pub/Sub topic our handler subscribes to.

### Option A — Drive `files.watch` change notifications → Pub/Sub (recommended first target)

The narrowest, lowest-setup event source: watch the "Meet Recordings" folder for new files.

1. **GCP project + Pub/Sub topic** `meet-transcripts` and a **push subscription** whose endpoint is a
   small HTTPS handler (a Cloud Function / Cloud Run service, *or* — to keep it all in one place — the
   n8n instance behind a thin verifying shim).
2. **Drive watch channel:** call `drive.files.watch` (or `changes.watch`) on the folder, delivering to a
   webhook. Drive watch channels **expire (≤ ~1 week, often less)** and must be **renewed** — a small
   scheduled job (Cloud Scheduler, or even a minimal Apps Script trigger kept *only* for renewal)
   re-creates the channel before expiry. This renewal job is the one piece of "polling" that survives,
   but it's cheap and event-volume-independent.
3. On a change event, the handler resolves the new Doc, exports it as Markdown (same Drive export call as
   the poller), builds the **same payload**, and POSTs to the n8n webhook with the shared secret.

**Trade-off:** Drive change events are coarse ("something changed in scope") — the handler still
de-dups and filters to *new transcript Docs* exactly as the poller does. Channel renewal is the main
operational wrinkle.

### Option B — Google Workspace Events API → Pub/Sub (the "proper" Meet-native path)

The [Workspace Events API](https://developers.google.com/workspace/events) lets you **subscribe** to
events on Google Meet resources and delivers them to a **Pub/Sub topic**. This is the cleanest long-term
fit because it is Meet-aware (e.g. a conference-record / artifact event) rather than Drive-generic.

1. **GCP project**, **Pub/Sub topic** + **push subscription** → HTTPS handler (as above).
2. **Create a subscription** (`workspaceevents.subscriptions.create`) targeting the Meet resource, with
   the topic as the notification target. Requires **OAuth with the right Meet scopes** and, for
   org-wide capture, **domain-wide delegation** to a service account so it can subscribe on behalf of
   organizers. Subscriptions also expire and need renewal.
3. On a Meet "transcript ready" event, the handler fetches the transcript artifact (Meet REST API /
   Drive), exports → Markdown, builds the **same payload**, POSTs to n8n.

**Trade-off:** more setup (Meet scopes + domain-wide delegation + a verified GCP project) but the most
precise signal and the least filtering.

## Pub/Sub push security (either option)

- The push subscription should use an **OIDC token** (`pushConfig.oidcToken`) so the handler can verify
  the request genuinely comes from Google Pub/Sub (validate the JWT audience + issuer) before doing any
  work — the n8n shared secret is the second layer.
- Pub/Sub guarantees **at-least-once** delivery → the handler must be **idempotent**. It already is, via
  the same dedup the poller uses (the create-only Contents PUT is the backstop: a duplicate event
  produces a 422 on an existing path, not a second capture).

## What this would add to the repo (when built)

- `integrations/meet/events/` — the Pub/Sub push handler (Cloud Function/Run source) + its deploy config.
- A renewal job (Cloud Scheduler config or a renewal-only Apps Script trigger).
- GCP setup docs: project, topic, subscription, service account + (Option B) domain-wide delegation.
- **No change** to `integrations/n8n/**` or to the `_inbox/` schema.

## Decision: defer

Build the poller now (done). Move to **Option A** when ≤15-min latency becomes a real complaint or empty
polling becomes a measurable cost; move to **Option B** when Meet-native, org-wide capture is wanted and
the team is ready to manage domain-wide delegation. Neither is a launch blocker — the poller satisfies the
m5 `done_when` end-to-end today, and the migration is front-half-only by design.
