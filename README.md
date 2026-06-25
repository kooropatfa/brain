# Brain 🧠

**Shared memory for a team and its AI agents — as an installable agent skill.** A Brain is one Git
repository of plain Markdown holding everything a team knows — decisions, specs, context, market
understanding — read by every person *and every AI agent*, and fed by all of them.

> You tell your agent *"add this to the brain"* — and from the next session on, **everyone's**
> agent knows it. That's the whole idea.

---

> ## ⚠️ Please read this before installing
>
> The easiest and safest way to install this is to **ask your AI agent** to do it for you —
> *"install the brain skill from kooropatfa/brain for Claude"* or
> *"install the brain skill from kooropatfa/brain for Codex"* — and let it walk you through the steps.
>
> Either way, know this up front: **part of the install runs a script downloaded from the internet,
> in your terminal.** As a rule you should **never** run a script from the internet without checking
> it first — that's true for *any* script from *anywhere*, not only this one.
>
> We promise this script is safe, and here is **exactly what it does** — nothing hidden:
>
> 1. Installs **Node**, **Git**, and the **GitHub CLI**, only if you don't already have them.
> 2. For Claude, installs **Claude Code**, only if you don't already have it.
> 3. For Codex, clones/updates this engine repo, links the Codex skill into `~/.codex/skills/brain`,
>    and adds a `SessionStart` hook to `~/.codex/hooks.json`.
> 4. Registers the installed adapter in `~/.brain/agent-integrations.json`.
> 5. Opens your **web browser** so you can sign in to GitHub (no password or token to copy anywhere).
> 6. For Claude, prints the two commands you then run inside Claude Code to switch the skill on.
>
> That's the entire script — it does not read or modify your project files or private keys.
>
> **Still: verify it yourself before running it.** Paste the command to your AI agent and ask
> *"is this safe? what does it actually do?"*, or download the script and read it. The Claude
> installers sit at the repo root ([`install.sh`](./install.sh), [`install.ps1`](./install.ps1));
> the Codex installers sit under [`codex/`](./codex/). **Trust, but verify** — for this and for every
> command in this README.

---

This repository is the Brain **engine**: the mechanism only. **No knowledge lives here.** Your
knowledge lives in *your own* repo — a private, pure-data **knowledge repo** that this engine
scaffolds, syncs, classifies and files into. Installed agent adapters serve any number of Brains on
a machine; each project picks its Brain via a `.brains.yml` binding. No lock-in anywhere: the truth
is `.md` files in Git, readable by anything — today, and in ten years.

---

## How it works (60 seconds)

```
you: "add this to the brain" ──► your agent writes a raw capture into the
                                 brain's _inbox/ and opens a small PR   (seconds)
                                        │
                                        ▼
                       the pipeline (your session agent in local mode,
                       a GitHub Action in action mode) classifies the capture,
                       distils it into a clean note, files it under the right
                       dimension with [[cross-links]], opens an "Ingest:" PR
                                        │
                                        ▼
                       a structural reviewer checks + auto-merges  (clean → in)
                                        │
                                        ▼
                       every teammate's agent pulls the Brain at the start
                       of its next session — and now it just knows
```

Two honest facts about the pipeline: ingestion takes a moment (it's never instant), and **clean
ingestion PRs auto-merge by default** — a deterministic structural reviewer checks each one and
squash-merges those matching the known-safe shape; anything failing a check or carrying a
confidence flag is escalated to a human, never merged. A Brain that wants a human on every merge
opts out with `auto_merge: false` in its review-ingest shim.

Two ingestion modes, chosen per Brain in its `brain.config.yml`:

- **`local` (default)** — the session agent classifies and files captures itself. No API key, no
  CI dependency, zero infrastructure.
- **`action`** — a GitHub Actions pipeline in the knowledge repo does it headlessly (three thin
  shim workflows call this engine's reusable workflows, pinned to a version tag).

---

## Install agent integrations (once per machine)

Install the coding agent adapters you use on this machine. Claude Code, Codex, and future adapters
share the same engine and the same Brain knowledge repos under `~/.brain/<name>`.

The installers register adapters in `~/.brain/agent-integrations.json`. Re-running the same
installer refreshes that adapter without duplicating hooks or skills. Installing another adapter
adds it to the registry and leaves the existing adapters in place.

### Claude Code

Prerequisites (Node, Git, GitHub CLI, Claude Code + browser sign-in) — one paste in a terminal.
This is the script described in the warning box above. **Good habit: before running it, ask your
agent *"is this command safe?"*** — for this command and any other you paste into a terminal.

macOS / Linux:
```bash
curl -fsSL https://raw.githubusercontent.com/kooropatfa/brain/main/install.sh | bash
```

Windows (PowerShell):
```powershell
irm https://raw.githubusercontent.com/kooropatfa/brain/main/install.ps1 | iex
```

Prefer to read a script before running it? Good instinct — both files sit at the root of this repo;
download, read, then run. ([install.sh](./install.sh) · [install.ps1](./install.ps1))

Then, inside Claude Code (identical on every OS):

```
/plugin marketplace add kooropatfa/brain
/plugin install brain@brain
```

That's the only Claude install you'll ever do — the plugin auto-updates, and one plugin serves every
Brain on the machine.

### Codex

Codex uses a native Codex skill plus the same engine checkout.

macOS / Linux:
```bash
curl -fsSL https://raw.githubusercontent.com/kooropatfa/brain/main/codex/install.sh | bash
```

Windows (PowerShell):
```powershell
irm https://raw.githubusercontent.com/kooropatfa/brain/main/codex/install.ps1 | iex
```

This clones or updates the engine at `~/.local/brain-engine`, installs the Codex skill at
`~/.codex/skills/brain`, adds a Codex `SessionStart` hook that syncs bound Brains, and signs in with
GitHub CLI if needed.

---

## Create a Brain (your knowledge repo)

The scaffolder generates a pure-data knowledge repo — folders, MOC notes, config; **no engine
files inside**:

```bash
node tools/brain-init/brain-init.mjs --name mybrain --org my-github-user \
  --company "Display Name" --dimensions "technical:archi & infra,craft:woodworking notes"
cd mybrain && git init -b main && git add -A && git commit -m "init brain: mybrain"
gh repo create my-github-user/mybrain --private --source . --push
```

Connect this machine to it (your agent runs this for you):

```
brain-sync connect --repo my-github-user/mybrain
```

Then bind a project: `echo 'use: [mybrain]' > <project>/.brains.yml`. Full walkthrough, flags and
the `action` ingestion mode: [`SETUP.md`](./SETUP.md) and
[`tools/brain-init/README.md`](./tools/brain-init/README.md).

## Join an existing Brain

Someone already runs a Brain and gave you access to its repo? Two steps:

```
brain-sync connect --repo owner/name
```

and bind the projects that should use it:

```yaml
# <project>/.brains.yml
use: [name]
```

From the next session on, your agent syncs that Brain at session start (clone lives at
`~/.brain/<name>`), consults it before non-trivial work, and "add this to the brain" opens PRs
against it. Unbound projects get asked once and the answer is saved to `.brains.yml`.

---

## Map of the repo

```
brain/                              ← the engine: agent integrations, zero knowledge inside
├─ README.md                       ← you are here
├─ SETUP.md                        ← create + connect your own Brain, step by step
├─ CHANGELOG.md                    ← notable engine changes
├─ install.sh · install.ps1        ← machine setup (prerequisites + browser sign-in)
├─ .claude-plugin/                 ← plugin + marketplace manifests (fixed name: brain)
├─ skills/brain/                   ← the agent skill: sync, read-before-work, captures
├─ codex/                          ← Codex installer + native Codex skill
├─ hooks/                          ← session-start sync + session-end capture
├─ tools/brain-sync/               ← clone/pull/PR helper (--brain <name>, connect)
├─ tools/brain-init/               ← scaffolder: generates a NEW knowledge repo from templates
├─ tools/classifier|normalizer|reviewer|notifier|inbox-watch/   ← ingestion machinery
├─ .github/workflows/              ← reusable CI workflows (action-mode Brains call them via shims)
└─ integrations/                   ← capture sources: Slack, Google Meet, n8n relay
```

What a generated knowledge repo looks like (and how the knowledge inside is organized —
dimensions, ADRs, the glossary) is documented in the repo itself: the scaffolder stamps a
member-facing README from
[`tools/brain-init/templates/skeleton/README.md`](./tools/brain-init/templates/skeleton/README.md).

## Where to go deeper

| You want to… | Read |
|---|---|
| create and run your own Brain | [`SETUP.md`](./SETUP.md) |
| see what changed recently | [`CHANGELOG.md`](./CHANGELOG.md) |
| scaffold a knowledge repo (all flags) | [`tools/brain-init/README.md`](./tools/brain-init/README.md) |
| install / use the agent skill, all fallbacks | [`skills/brain/README.md`](./skills/brain/README.md) |
| integrate another model agent | [`AGENT_INTEGRATIONS.md`](./AGENT_INTEGRATIONS.md) |
| see the capture schema | [`tools/brain-init/templates/skeleton/_inbox/README.md`](./tools/brain-init/templates/skeleton/_inbox/README.md) |
| understand the sync & PR helper | [`tools/brain-sync/README.md`](./tools/brain-sync/README.md) |
| understand the ingestion classifier | [`tools/classifier/README.md`](./tools/classifier/README.md) |
| understand the auto-review of ingestion PRs | [`tools/reviewer/README.md`](./tools/reviewer/README.md) |
| feed from a watched folder ("Dropbox feel") | [`tools/inbox-watch/README.md`](./tools/inbox-watch/README.md) |
| wire up Slack / Meet capture | [`integrations/slack/`](./integrations/slack/README.md) · [`integrations/meet/`](./integrations/meet/README.md) |

---

*The mental model: a Brain is to a company what `AGENTS.md` is to a repo — but living, organized
by dimension, shared by everyone, and continuously fed. This repo is the machinery that keeps it
that way; the knowledge itself always lives in your own repo.*
