---
title: Brain
type: home
tags: [home, moc]
---

# {{COMPANY}} Brain 🧠

**The company's shared memory.** One Git repository of plain Markdown holding everything we know —
decisions, specs, context, market understanding — read by every person *and every AI agent* in the
company, and fed by all of them.

> You tell your agent *"add this to the brain"* — and from the next session on, **everyone's**
> agent knows it. That's the whole idea.

There is **one Brain for everybody**. Not a per-person memory, not a vendor database. A single repo
(`{{REPO}}`) that every teammate's agent clones to their machine, consults before it works, and
writes back to through pull requests. Humans browse it in Obsidian or right here on GitHub. No
lock-in anywhere: the truth is `.md` files in Git, readable by anything — today, and in ten years.

This repo holds **knowledge only**. The machinery that syncs, classifies and files it — the Brain
**engine** — lives in [`kooropatfa/brain`](https://github.com/kooropatfa/brain) and is installed
once per machine as an agent integration for Claude Code or Codex.

---

## How it works (60 seconds)

```
you: "add this to the brain" ──► your agent writes a raw capture into _inbox/
                                 and opens a small PR            (seconds)
                                        │
                                        ▼
                       the pipeline (your session agent in local mode,
                       a GitHub Action in action mode) classifies the capture,
                       distils it into a clean note, files it under the right
                       dimension with [[cross-links]], opens an "Ingest:" PR
                                        │
                                        ▼
                       a human reviews and merges                (one click)
                                        │
                                        ▼
                       every teammate's agent pulls the Brain at the start
                       of its next session — and now it just knows
```

This Brain runs `ingestion: {{INGESTION}}` (set in [`brain.config.yml`](./brain.config.yml)).
Two honest facts about the pipeline: ingestion is never instant, and **clean ingestion PRs
auto-merge by default** — a deterministic structural reviewer checks each one and squash-merges
those matching the known-safe shape; anything questionable is escalated to a human, never merged.
To require a human on every merge, set `auto_merge: false` in this repo's review-ingest shim.

The PR link your agent gives you **is** the confirmation. You never touch a format, a folder, or a
merge button.

---

## Get connected (once per machine)

### The easy way — let your agent install it

You have a coding agent; make it do the work.

For **Claude Code**, paste this into a Claude Code session:

```
Set up the Brain on this machine:
1. Run the prerequisites installer from https://github.com/kooropatfa/brain
   (macOS/Linux: install.sh · Windows: install.ps1). It installs Node, Git, the
   GitHub CLI and Claude Code if missing, and signs me in to GitHub in my browser.
2. Register the engine plugin:
     claude plugin marketplace add kooropatfa/brain
     claude plugin install brain@brain
3. Connect this Brain: brain-sync connect --repo {{REPO}}
4. Tell me what to expect: the next session greets me with "🧠 Brain synced",
   the Brain lives at ~/.brain/{{NAME}}, and from then on I can say
   "add this to the brain" to save anything.
```

For **Codex**, paste this into a Codex session:

```
Set up the Brain on this machine for Codex:
1. Run the Codex installer from https://github.com/kooropatfa/brain
   (macOS/Linux: codex/install.sh · Windows: codex/install.ps1). It checks for Node, Git and the
   GitHub CLI, clones the engine to ~/.local/brain-engine, links the Codex skill into
   ~/.codex/skills/brain, adds a SessionStart hook, and signs me in to GitHub in my browser if needed.
2. Connect this Brain:
     node ~/.codex/skills/brain/scripts/brain-tool.mjs brain-sync connect --repo {{REPO}}
3. Bind this project with .brains.yml:
     use: [{{NAME}}]
4. Tell me what to expect: Codex can now use the $brain skill, the Brain lives at
   ~/.brain/{{NAME}}, and new Codex sessions sync it at start.
```

The agent runs the scripts, you click through the GitHub browser sign-in when it appears, done.

### By hand (3 minutes)

Pick the agent you use on this machine.

#### Claude Code

**Step 1 — prerequisites.** One paste in a terminal. Installs Node + Git + GitHub CLI + Claude Code
(only what's missing) and signs you in to GitHub **in your browser** — no token to copy.

macOS / Linux (Terminal):
```bash
curl -fsSL https://raw.githubusercontent.com/kooropatfa/brain/main/install.sh | bash
```

Windows (PowerShell — Start menu → type "PowerShell" → Enter):
```powershell
irm https://raw.githubusercontent.com/kooropatfa/brain/main/install.ps1 | iex
```

**Step 2 — turn on the engine plugin.** Open Claude Code and run two lines (identical on every OS):

```
/plugin marketplace add kooropatfa/brain
/plugin install brain@brain
```

**Step 3 — connect this Brain.** In a Claude Code session, ask your agent to run:

```
brain-sync connect --repo {{REPO}}
```

That clones this repo to `~/.brain/{{NAME}}`. Your agent now syncs it at the start of every
session, and the engine plugin auto-updates — there is nothing to keep current.

#### Codex

**Step 1 — install the Codex skill.** One paste in a terminal. It requires Node + Git + GitHub CLI,
clones/updates the engine under `~/.local/brain-engine`, links the skill into `~/.codex/skills/brain`,
adds a `SessionStart` hook to `~/.codex/hooks.json`, and signs you in to GitHub **in your browser**
if needed.

macOS / Linux (Terminal):
```bash
curl -fsSL https://raw.githubusercontent.com/kooropatfa/brain/main/codex/install.sh | bash
```

Windows (PowerShell — Start menu → type "PowerShell" → Enter):
```powershell
irm https://raw.githubusercontent.com/kooropatfa/brain/main/codex/install.ps1 | iex
```

**Step 2 — connect this Brain.** In a Codex session, ask your agent to run:

```
node ~/.codex/skills/brain/scripts/brain-tool.mjs brain-sync connect --repo {{REPO}}
```

Then bind the project with `.brains.yml`:

```yaml
use: [{{NAME}}]
```

**Verify:** start a new session in a project bound to this Brain — the greeting includes
`🧠 Brain synced` in Claude Code; in Codex, ask the agent to use `$brain` and check whether this
project is bound and synced. Or just ask your agent: *"is my brain connected?"*

Locked-down machine, CI, no browser? The fallback paths (manual clone, persistent `GH_TOKEN`) are
in the [engine docs](https://github.com/kooropatfa/brain/blob/main/skills/brain/README.md).

### No terminal at all? You're covered

You don't need Claude Code — or any tool install — to feed the Brain:

- **Obsidian** — open this repo's folder as a vault and write notes; the Obsidian Git plugin
  commits and pushes for you.
- **GitHub web** — drag a file (note, PDF, screenshot) into [`_inbox/`](./_inbox/) on github.com.
  The pipeline formats and files it.
- **Slack / Google Meet** — capture integrations live in the engine repo:
  [integrations](https://github.com/kooropatfa/brain/tree/main/integrations).

---

## Using it day to day

- **Read: just work.** Your agent consults the Brain on its own before non-trivial work — you'll
  see it cite Brain files when it answers. Humans: open the vault in Obsidian (backlinks, graph,
  search) or browse the folders here.
- **Save: say it in plain words.** *"Add this to the brain"* / *"wrzuć to do braina"* — and point at
  anything: a decision you just made, a doc, a PDF, an email, a Notion or Slack link, a screenshot,
  a chunk of reasoning. The agent writes the capture, opens the PR, the pipeline files it.
- **Bind your projects.** A project declares which Brain(s) it uses in a `.brains.yml` at its root:
  `use: [{{NAME}}]`. Unbound projects get asked once at session start.
- **Tune it (optional).** Everything works with zero config. To tweak behavior, drop a
  `{{NAME}}.yml` in a project (shared, per-project settings) or `~/.config/{{NAME}}.yml`
  (personal) — e.g. `proactive: false`. All knobs:
  [configuration reference](https://github.com/kooropatfa/brain/blob/main/skills/brain/references/configuration.md).

---

## How the knowledge is organized

Top-level folders are **dimensions** — the lenses the company understands itself through:

| Dimension | The lens | Door in |
|-----------|----------|---------|
{{DIMENSIONS_TABLE}}

Plus the fixed infrastructure folders (not dimensions):

| Folder | What it is |
|--------|-----------|
| **`_inbox/`** | the loading dock — every raw capture lands here before the pipeline files it ([schema](./_inbox/README.md)) |
| **`decisions/`** | the decision log — dated, immutable ADRs: what was decided, why, what was rejected ([[decisions/index]]) |

And the shared vocabulary: **[[ubiquitous-language]]** — one agreed definition per term, so humans
and AI use words the same way.

### Conventions that keep it healthy

- **Each dimension has an `index.md`** — its map of content (MOC), the one obvious door in.
- **Cross-links are first-class.** An insight in one dimension links to the notes it affects in the
  others. The graph *is* the alignment.
- **Decisions are ADRs.** Hard-to-reverse decisions go in `decisions/` as dated, immutable notes; a
  reversal is a *new* ADR that supersedes the old one — the trail is never lost.
- **AI writes the same way humans do** — the same `[[wiki-links]]`, the same pull requests, so
  machine-written knowledge is as connected and as reviewable as human-written knowledge.
- **Dimensions are flexible, not a fixed set.** A new lens earns a folder when a real need appears:
  append it to `dimensions:` in `brain.config.yml`, create the folder, add an `index.md`. That's
  the whole ceremony.

### How agents consume it

One clone per machine — `~/.brain/{{NAME}}` — shared by all of that person's projects. The installed
agent integration syncs it (fast-forward pull) at session start or when the skill runs, and opens PRs
for contributions. Projects don't vendor the Brain, don't submodule it, don't copy it — they read the
sibling clone and send knowledge back as PRs against this repo, decoupled from code PRs. On machines
with several Brains, the per-project `.brains.yml` (`use: [{{NAME}}]`) decides which Brain a session
reads and feeds — no Brain acts globally.

---

*The mental model: the Brain is to a company what `AGENTS.md` is to a repo — but living, organized
by dimension, shared by everyone, and continuously fed.*
