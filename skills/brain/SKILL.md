---
name: brain
description: >-
  Use at the START of every coding session and whenever knowledge should flow to or from the team's
  knowledge vault repos — one plugin, any number of Brains. On session start, sync each bound Brain.
  Consult it before non-trivial or cross-dimension work. CONTRIBUTE when the user asks to save
  something to the Brain — phrases like "add this to the brain", "throw this in the brain", "save to
  the brain", "feed the brain", "put this in the brain", or the Polish equivalents users may type
  ("wrzuc to do braina", "zapisz to w brainie") — they point at a note, doc, PDF, email, Notion link,
  Slack thread or channel link, screenshot, or a chunk of reasoning, and you turn it into a capture.
  Also OFFER to save something proactively when a decision was made, a spec emerged, or a non-obvious
  insight surfaced (unless the user has turned proactive offers off in config). Resolve the project's
  .brains.yml binding FIRST — act only for the Brains the project binds; if no binding exists, ask
  the user which Brain to use and save their choice.
---

# brain — your agent's link to the Brain knowledge vaults

The **Brain** is a shared knowledge vault: a Git repo of Markdown notes, organized into dimensions
(default set: `technical`, `business`, `product`, `design`, `user` — each Brain defines its own in
its `brain.config.yml`) plus `decisions/` (ADRs), `_inbox/` (the loading dock), and a glossary. One plugin — any number of Brains, each a separate repo cloned under
`~/.brain/<name>`. You feed it by dropping a **capture** into `_inbox/`; a GitHub Action then
classifies it, writes a clean note, files it, and opens a PR. This skill drives that pipeline — it
adds no new machinery.

## Quick start (the whole skill in 5 lines)
0. **Which Brain?** `.brains.yml` (`use: [<name>]`) at the project root decides — names are Brain
   names (clone dirs under `~/.brain/`). Not bound -> ask once, save the choice. `use: []` -> stand down.
1. **Session start:** sync each bound Brain — `node <plugin>/tools/brain-sync/brain-sync.mjs read --brain <name>`.
   (The SessionStart hook already did this; the greeting names the brain.)
2. **Need context:** read files under `~/.brain/<name>` — `grep` the dimension folders.
3. **User says "add this to the brain":** write a capture into `~/.brain/<name>/_inbox/`, then
   `brain-sync contribute --brain <name> --message "Capture: <title>"`. Report the PR link.
4. **Never merge a Brain PR.** You open them; a reviewer lands them.

That's it. The sections below are detail for when you need it.

> Paths like `~/.brain/<name>` refer to the Brain clone, not the project you're working in.
> Get the path with `BRAIN=$(node <plugin>/tools/brain-sync/brain-sync.mjs path --brain <name>)`.
> `<plugin>` = the installed plugin root (`$CLAUDE_PLUGIN_ROOT`).

## Config (optional — works with zero config)
The engine ships in the plugin; knowledge repos contain no engine code. New machine + existing brain:
`brain-sync connect --repo <owner/name>`. New brain from scratch: `tools/brain-init` (see SETUP.md).
No `.brains.yml` binding yet (fresh install)? The agent walks you through connect-or-create — §0.5.

Behavior is adjustable per-project and per-person via an optional `brain.yml`. Read it at session
start and let it override the defaults below; if absent, use the defaults. See
`references/configuration.md`.

| Setting | Default | Effect |
|---|---|---|
| `brain_dir` | `~/.brain/<name>` | where the clone lives (or `$BRAIN_DIR`). |
| `auto_pull` | `true` | pull on session start vs. use the existing clone. |
| `preflight` | `quiet` | `quiet` / `off` / `verbose` session-start reporting. |
| `proactive` | `true` | whether you offer to save things unprompted. |
| `offer_cap` | `2` | max proactive offers per session. |
| `dimensions` | all | which dimension folders you read first. |
| `session_capture` | `off` | `on` = a SessionEnd hook auto-captures durable session knowledge into the Brain. |

Resolve in this order (later wins): defaults → `~/.config/brain.yml` → `~/.config/<name>.yml` →
project `brain.yml` → project `<name>.yml`. See `references/configuration.md` for the full layer spec.

## Hard rules
- **Never merge, approve, or enable auto-merge** on a Brain PR. You open PRs; reviewers land them.
- **Never fabricate frontmatter.** Omit a field you can't fill truthfully — a wrong value misleads the
  classifier.
- **Never save something proactively without a yes.** Offer, then wait. (And only if `proactive` is on.)
- **Never hard-reset or discard the user's Brain clone** to fix a diverged pull — surface it, let them decide.
- **Stay schema-valid.** Every capture must pass the check in `references/schema-v1.md`.
- **Respect the `.brains.yml` binding.** When the project binds other Brain(s), this Brain stays
  silent and untouched. Unbound project -> no reads, no contributions, until the user picks.

---

## 0. Which Brain? — the `.brains.yml` binding
One machine can host several Brains (work, private, per venture). The choice is per project, never
global:
- `<project>/.brains.yml` — `use: [<name>]` (scalar or inline list; `[]` = no Brain here). Commit it.
- `~/.config/brains.yml` — machine-wide fallback for projects without their own file.
- `<name>` is the Brain's name — the clone directory basename under `~/.brain/` (e.g. `personal`, `work`).

The SessionStart hook resolves this before syncing: bound -> normal preflight; bound elsewhere ->
total silence; unbound -> it lists the machine's Brains and tells you to ASK the user, then write
the file (`use: [<their choice>]`) unless they want it session-only. `brain-sync contribute`
enforces the same rule (`--force-unbound` overrides, only on the user's explicit say-so), and the
SessionEnd auto-capture requires an explicit binding.

When several Brains are bound and the user says "add this to the brain", ask which one — or read it
from their phrasing ("put this in my work brain" -> work).

---

## 0.5 First-run onboarding — connect or create
Trigger this when the project has **no `.brains.yml` binding** (the hook printed the UNBOUND line, §0)
**or** the user says "set up my brain" / "connect a brain" / "create a brain". Drive the conversation;
don't just save a name blind. (This is the guided version of §0's "ask once, save the choice".)

Ask first: **"Do you already have a knowledge repo (a Brain) you have access to, or should we create
a new one?"** Then take one branch:

### CONNECT — they already have a Brain (incl. joining a team/company Brain)
They have repo access — their own Brain on a new machine, or a shared private knowledge repo they were
granted access to. Same path either way.
1. Get the repo as `<owner/name>`.
2. `node <plugin>/tools/brain-sync/brain-sync.mjs connect --repo <owner/name>` — clones it to `~/.brain/<name>` (name = repo basename).
3. Write `<project>/.brains.yml` with `use: [<name>]` (the repo basename).
4. Confirm: bound — next session's preflight (§1) syncs it; "add this to the brain" now opens PRs against it.

### CREATE — no Brain yet
Gather, asking only for what's missing:
- **name** — lowercase, no spaces (becomes the repo basename + clone dir, e.g. `mybrain`).
- **org** — their GitHub user or org.
- **company** — *optional* display name (defaults to the org).
- **ingestion** — default `local` (no API key; you classify captures yourself, §3). `action` = a CI
  pipeline classifies — needs an `ANTHROPIC_API_KEY` secret on the repo. (Optional `--dimensions
  "name:blurb,name:blurb"` if they want a custom dimension set instead of the default five.)

Then:
1. `node <plugin>/tools/brain-init/brain-init.mjs --name <name> --org <org> [--company "<display>"] [--ingestion local|action] [--dimensions "<...>"]` — scaffolds a pure-data repo and prints **"Next steps"**.
2. Walk them through those printed steps in order:
   - `cd <name> && git init -b main && git add -A && git commit -m "init brain: <name>"`
   - `gh repo create <org>/<name> --private --source . --push`
   - if `ingestion: action`: `gh secret set ANTHROPIC_API_KEY --repo <org>/<name>`
   - `node <plugin>/tools/brain-sync/brain-sync.mjs connect --repo <org>/<name>`
   - write `<project>/.brains.yml` with `use: [<name>]`
3. Confirm: bound and connected — next session's preflight (§1) syncs it.

### NEITHER — not now
If they want neither yet, don't force it: write `.brains.yml` with `use: []` (explicit no-Brain — the
SessionStart hook won't ask again) or leave it session-only, and stand down. Don't nag.

(Flags above are exactly what the tools accept.)

---

## 1. Session-start preflight
The plugin's **SessionStart hook** (`hooks/session-start-sync.mjs`) already runs this automatically —
if a `🧠 Brain …` line is in your context, the sync is done; do NOT re-run preflight, just read the
status from that line. The manual procedure below is the fallback for environments where plugin hooks
don't fire (e.g. the skill copied without the plugin). Run it once, in the background of the first
turn — never delay the user, never nag when all is well. Honor the `preflight` and `auto_pull` config.

```
1. node <plugin>/tools/brain-sync/brain-sync.mjs config --brain <name>     # no network; reads token_present, brain_dir, repo
2. token missing?            → print TOKEN-MISSING, stop (you can still read a previous clone)
3. auto_pull is on?          → node <plugin>/tools/brain-sync/brain-sync.mjs read --brain <name>
       exit 0                     → GREEN  (one line, or silent if preflight=off)
       exit≠0 & "pull failed"     → DIVERGED  (do NOT auto hard-reset)
       exit≠0 & clone/network err → DEGRADED  (use the last-pulled copy if present)
```
`read` prints the Brain path on **stdout**; all `brain-sync:` lines are **stderr**. First-ever run (no
clone) → **NEEDS-SETUP** (point at the README's install).

**Messages (keep them this short):**
- **GREEN:** `🧠 Brain synced.` (or say nothing if `preflight: off`)
- **TOKEN-MISSING:** `🧠 Brain: no GitHub sign-in found ($GH_TOKEN empty and 'gh auth token' returned nothing). I can read a previous copy but can't pull or contribute. Fix: run 'gh auth login' (browser) — or set a repo+workflow PAT as GH_TOKEN (Windows: [Environment]::SetEnvironmentVariable('GH_TOKEN','<pat>','User'); macOS/Linux: export it in your shell profile).`
- **DIVERGED:** `🧠 Brain: your local clone has diverged from the default branch (pull isn't fast-forward). I won't touch your edits — reconcile in <brain_dir> (commit/stash, then git pull --ff-only).`
- **DEGRADED:** `🧠 Brain: can't reach GitHub — using the last-pulled copy (may be stale).`
- **NEEDS-SETUP:** point at this skill's `README.md` (prerequisites one-liner + the two `/plugin` commands).
- **UNBOUND:** the hook already printed the available Brains — run the first-run onboarding (§0.5):
  ask connect-or-create, write `.brains.yml`, then run preflight for the chosen Brain.

---

## 2. Using the Brain
Get the path, then read files directly — there's no built-in search. The snippets below are POSIX shell;
on Windows PowerShell use the mirror form (pick by platform):
- POSIX: `BRAIN=$(node <plugin>/tools/brain-sync/brain-sync.mjs path --brain <name>)` then
  `grep -ri "<term>" "$BRAIN"/{technical,business,product,design,user,decisions}`
- PowerShell: `$env:BRAIN = node <plugin>/tools/brain-sync/brain-sync.mjs path --brain <name>` then
  `Select-String -Pattern "<term>" (Get-ChildItem $env:BRAIN\technical,$env:BRAIN\business,$env:BRAIN\product,$env:BRAIN\design,$env:BRAIN\user,$env:BRAIN\decisions -Recurse -Filter *.md)`

The folder lists above use the default dimension set — substitute the bound Brain's own dimensions
from its `brain.config.yml`.

- **Start from the MOC:** `"$BRAIN/<dimension>/index.md"` lists what's in a dimension and links to notes.
- **Check the glossary** before assuming a term's meaning: `"$BRAIN/ubiquitous-language.md"`.
- **Respect ADR status** in `"$BRAIN/decisions/"` — a `superseded` ADR is history; follow `superseded_by`.
- **Consult** before non-trivial or cross-dimension work, or when the user references a past decision.
  **Skip** for trivia. If `dimensions` is set in config, focus your first reads there.

More patterns: `references/reading-the-brain.md`.

---

## 3. Contributing
Two paths. Both end with a capture in the Brain clone's `_inbox/` and a PR via brain-sync; the ingestion
Action does the classifying and filing. You never write the distilled note yourself —
unless the instance runs `ingestion: local` (see "Local ingestion" below).

### On command — the main path
The user points at material ("add this to the brain", "throw this in", "save to the brain", or the same
in Polish). Turn it into a valid capture:

1. **Read** the material (file, paste, or fetch the link if you can).
2. **Pick the true `source`** — most-specific real origin wins (an emailed PDF is `email`, not `other`).
3. **Gather it verbatim** — don't pre-summarize; fidelity over tidiness.
4. **Set `captured`** — ISO-8601 UTC, second precision, the instant the material was created (not now).
5. **Name the file** — `<source>-YYYY-MM-DD-HHMM.md` (UTC, same instant). Minute taken? Bump it — a
   `-suffix` fails validation.
6. **Write frontmatter** — required `source`/`captured`/`title`; truthful source-specific fields only;
   optional `hint`/`tags`. (`source: other` requires `source_detail`.)
7. **Write the body** raw. Binaries (PDF, screenshot) → `"$BRAIN/_attachments/"`, linked via `[[…]]`.
8. **Validate:** `node "<plugin>/tools/classifier/context.mjs" --repo "$BRAIN" --capture "_inbox/<file>.md"` →
   expect `"schema_ok": true`.
9. **Contribute:** `node "<plugin>/tools/brain-sync/brain-sync.mjs" contribute --brain <name> --message "Capture: <title>"`.
10. **Report the PR URL** and run the loop (§5).

**Source → schema** (full worked examples: `references/capture-cookbook.md`):

| User gives… | `source` | source-specific | body holds | attachment |
|---|---|---|---|---|
| a note / reasoning | `manual` | — | the note / verbatim reasoning | — |
| meeting transcript | `meet` | `participants`, `file` | transcript verbatim | link in `file` |
| Slack thread link | `slack` | `participants`, `channel` | pasted thread + the link | — |
| Slack channel link | `slack` | `channel` | what's relevant + the link | — |
| email / thread | `email` | `participants`, `channel` | email text verbatim | PDF/eml → `_attachments/` |
| PDF | by true origin | per origin | framing + extracted text if useful | PDF → `_attachments/` |
| Notion link | `other` (+`source_detail: Notion`) | — | the link + any pasted content | — |
| screenshot | `other` (+`source_detail: screenshot`) | — | one line on what it shows | image → `_attachments/` |

Rules: `other` always needs `source_detail`; never fabricate `participants`/`channel`; a bare link is
weak — paste the substance so the classifier has material.

### Local ingestion (`ingestion: local` in brain.config.yml)
Some instances run WITHOUT an Anthropic API key: `brain.config.yml` sets `ingestion: local`, the CI
pipeline stands down, and YOU are the classifier. After step 8 (validate), do the Action's job
yourself before contributing:

1. Build the same context the CI classifier would get:
   `node "<plugin>/tools/classifier/context.mjs" --repo "$BRAIN" --capture "_inbox/<file>.md"`.
2. Follow `"<plugin>/tools/classifier/PROMPT.md"`: classify into a dimension (or an ADR), distil a
   clean note, add `[[cross-links]]` and a one-line MOC backlink.
3. Delete the capture from `_inbox/` — the filed note replaces it; paste the raw material verbatim
   into the PR body so fidelity survives review.
4. Contribute ONE PR: `brain-sync contribute --brain <name> --message "Ingest: <title>" --body "<raw capture>"`.
5. Inbox sweep: when the synced clone holds pending `_inbox/` captures (dropped via GitHub web or
   integrations), offer once per session to ingest them the same way.

In `action` mode (the team/CI option — the scaffolder default is `local`) you NEVER write the
distilled note yourself — the pipeline does.

### Proactive — offer when something's worth keeping
Only if `proactive` is on (default), and within `offer_cap` per session. When a **decision is made**, a
**spec emerges**, or a **non-obvious insight** surfaces, offer **once**, briefly, at a natural boundary:
> "This looks worth keeping — want me to add it to the Brain?"

Skip routine edits, restating docs, things already in the Brain, and thinking-aloud. Never re-offer a
declined item. On a yes → run the on-command steps above. Heuristics: `references/proactive-capture.md`.

> If `session_capture: on` is set, a SessionEnd hook already distils the finished session into a
> capture automatically — keep proactive offers for things worth saving MID-session (material the
> user points at, or knowledge needed by others before this session ends); don't offer to save "a
> summary of this session", the hook owns that.

---

## 4. What happens after you contribute
Your push fires the **ingestion Action**: it classifies the capture, distils a clean note, files it
(ADRs → `decisions/`), adds `[[cross-links]]` and a one-line MOC backlink, removes the capture from
`_inbox/`, opens an `Ingest: …` PR, and files an issue per genuine action item. A separate automated
reviewer checks ingestion PRs and by default auto-merges (squash) the clean ones; anything
questionable is escalated to a human (a repo can require a human on every merge via `auto_merge:
false` in its review shim).
Point the user at your `Capture: …` PR — that's their confirmation. (In `ingestion: local`
instances nothing fires after your push — your `Ingest:` PR IS the whole pipeline.) Detail:
`references/ingestion-behavior.md`.

## 5. After contributing — stay current
```
open PR (report the URL)
  → re-pull:  node <plugin>/tools/brain-sync/brain-sync.mjs read --brain <name>
  → optional, bounded: gh pr view <ingest-PR> --json state,mergedAt   (cap ~2 min, no busy-wait)
  → on merge: read again so your local Brain is current
  → not merged yet? next session's preflight catches up.
```
Never merge / approve / auto-merge.

---

## References
- `references/configuration.md` — the config layers and every knob.
- `references/brain-sync-cli.md` — the brain-sync CLI in full.
- `references/schema-v1.md` — the capture schema + the validation command.
- `references/capture-cookbook.md` — one worked capture per source type.
- `references/reading-the-brain.md` — MOC / glossary / ADR navigation.
- `references/proactive-capture.md` — when and how to offer.
- `references/ingestion-behavior.md` — what the Action + reviewer do once a capture lands.
