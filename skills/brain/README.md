# 🧠 brain

**Your coding agent, plugged into the company's shared knowledge.**

---

> ## ⚠️ Please read this before installing
>
> The easiest and safest way to install this is to **ask your AI agent** to do it for you — say
> *"install the brain skill from kooropatfa/brain for Claude"* or
> *"install the brain skill from kooropatfa/brain for Codex"* and let it walk you through the steps
> below.
>
> Either way, one thing to know up front: **part of the install runs a script downloaded from the
> internet, in your terminal.** As a rule you should **never** run a script from the internet without
> checking it first — that's true for *any* script from *anywhere*, not just this one.
>
> We promise this script is safe, and here is **exactly what it does** — nothing hidden:
>
> 1. Installs **Node**, **Git**, and the **GitHub CLI**, only if you don't already have them.
> 2. For Claude, installs **Claude Code**, only if you don't already have it.
> 3. For Codex, clones/updates the engine repo, links the skill into `~/.codex/skills/brain`, and
>    adds a `SessionStart` hook to `~/.codex/hooks.json`.
> 4. Opens your **web browser** so you can sign in to GitHub (no password or token to copy anywhere).
> 5. For Claude, prints the two commands you then run inside Claude Code to switch the skill on.
>
> That's the entire script. It does not read or modify your project files or private keys.
>
> **Still — verify it yourself before running it.** The simplest way: paste the command to your AI
> agent and ask *"is this safe? what does it actually do?"* Or download the script and read it (it's
> short). **Trust, but verify.**

---

## What you get

Install it once. After that, every time you work with your AI agent it will:

- **Know what the company already knows** — it reads the shared Brain before doing real work, so it
  won't miss a decision or redo something that's already settled.
- **Remember the good stuff for you** — when something worth keeping comes up, just say
  *"add this to the brain"* and point at it (a note, a PDF, an email, a Slack thread, a screenshot, or
  even *"that thing we just figured out"*). It writes it up and files it. No format to learn.

You stop being the person who has to remember to write things down.

---

## Install (about 2 minutes, once per computer)

Two small steps. **A good habit: before running any of these commands, ask your agent *"is this
command safe?"*** — never paste something into a terminal you haven't checked.

Pick one integration per computer. The installer records the choice in
`~/.brain/agent-integration.json`; re-running the same installer refreshes it, while installing a
different agent integration refuses with a message naming the currently selected agent.

### Claude Code

#### Step 1 — set up the basics

This is the script described in the box at the very top — the one we just told you exactly what it
does. Pick your system:

<details open><summary><b>Windows</b> — open PowerShell (Start menu → type "PowerShell" → Enter)</summary>

```powershell
irm https://raw.githubusercontent.com/kooropatfa/brain/main/install.ps1 | iex
```

Want to read it before running it? Download it first, open `install.ps1` in Notepad, then run it:
```powershell
irm https://raw.githubusercontent.com/kooropatfa/brain/main/install.ps1 -OutFile install.ps1
powershell -ExecutionPolicy Bypass -File .\install.ps1
```
</details>

<details><summary><b>macOS / Linux</b> — open the Terminal app</summary>

```bash
curl -fsSL https://raw.githubusercontent.com/kooropatfa/brain/main/install.sh | bash
```

Want to read it before running it? Download it first, read it, then run it:
```bash
curl -fsSL https://raw.githubusercontent.com/kooropatfa/brain/main/install.sh -o install.sh
less install.sh   # read it (press q to quit), then:
bash install.sh
```
</details>

#### Step 2 — switch the skill on

Open Claude Code and run these two lines (the same on every system):

```
/plugin marketplace add kooropatfa/brain
/plugin install brain@brain
```

That's the install. Open any project and your agent picks it up on its own. The skill ships in the
plugin and updates itself from the marketplace — nothing for you to maintain.

### Codex

Install the native Codex skill from this same engine repo. It clones/updates the engine at
`~/.local/brain-engine`, links the skill into `~/.codex/skills/brain`, and adds a `SessionStart`
hook so bound Brains sync when a Codex session starts.

```bash
curl -fsSL https://raw.githubusercontent.com/kooropatfa/brain/main/codex/install.sh | bash
```

PowerShell:

```powershell
irm https://raw.githubusercontent.com/kooropatfa/brain/main/codex/install.ps1 | iex
```

### Connect your Brain

If your team already has a Brain (or you're joining one), connect it — your agent can run this for you,
or you can run it yourself (ask *"is this safe?"* first if you like):

Claude Code:

```
brain-sync connect --repo <owner/name>
```

Codex:

```
node ~/.codex/skills/brain/scripts/brain-tool.mjs brain-sync connect --repo <owner/name>
```

This downloads the Brain to `~/.brain/<name>`. Then, in each project where you want to use it, add a
small file named `.brains.yml` at the project root containing:

```yaml
use: [<name>]
```

### Check it worked

Easiest: just ask your agent — **"is my brain connected?"**

Prefer to check by hand?

Claude Code:

```
node <plugin>/tools/brain-sync/brain-sync.mjs config --brain <name>
```

Codex:

```
node ~/.codex/skills/brain/scripts/brain-tool.mjs brain-sync config --brain <name>
```

Look for `"token_present":true`.

---

## How to use it (there's almost nothing to learn)

- **Reading** happens by itself — your agent checks the Brain when it matters. You do nothing.
- **Saving** is one sentence: *"add this to the brain."* Point at anything — a note, a PDF, an email,
  a Notion or Slack link, a screenshot, or *"that thing we just figured out."* Your agent writes it up,
  opens a pull request, and the pipeline files it. You get a link as confirmation and never touch the
  format or merge anything.

That's the whole loop.

---

## Make it yours (optional — it works with zero setup)

Everything works out of the box. If you *want* to change how it behaves, copy the template
`brain.example.yml` into one of these spots:

- `~/.config/brain.yml` — **your personal** settings (private; never overwritten by updates), or
- `<your project>/brain.yml` — settings the **whole team** shares for that project.

The options you're most likely to want:

| Setting | What it does | Default |
|---|---|---|
| `proactive: false` | Stop the agent offering to save things on its own — it saves only when you ask. | `true` (it offers) |
| `auto_pull: false` | Don't refresh the Brain at the start of every session (handy if you're often offline). | `true` (refresh) |
| `dimensions: [technical]` | Focus the agent's reading on the areas you work in (you still have access to everything). | all areas |
| `preflight: off` | Hide the one-line "Brain synced" message at session start. | `quiet` |
| `session_capture: on` | When a session ends, automatically save anything durable that came up. | `off` |

Example `~/.config/brain.yml`:
```yaml
proactive: false
dimensions: [technical, product]
auto_pull: false
```

Want the complete list of options and how the layers stack? See `references/configuration.md`.

---

<details><summary><b>How it fits together</b> (for the curious)</summary>

The skill is a thin wrapper over two tools that ship in the **Brain engine** (`kooropatfa/brain`):
- **brain-sync** (`tools/brain-sync/`) — clones/pulls a Brain knowledge repo and opens PRs from your edits.
- **the ingestion pipeline** (`.github/workflows/`) — turns a raw capture into a clean, filed, cross-linked note.

The engine (tools, hooks, skill) lives outside knowledge repos. Knowledge repos (`~/.brain/<name>`)
hold only Markdown notes and `brain.config.yml` — no engine code. Claude installs it as a plugin;
Codex installs it as a native Codex skill plus `SessionStart` hook. One Brain copy per computer per
knowledge repo (`~/.brain/<name>`), shared across all your projects.

</details>

<details><summary><b>Installing without the Claude plugin</b> (locked-down machine, or no marketplace)</summary>

Same "check it first" rule applies — read any command before you run it, or ask your agent.

Install the plugin from the engine repo and copy the skill from there (re-copy after each engine
update — no auto-update this way; **don't** copy from a Brain clone, those hold no engine code):
```bash
git clone https://github.com/kooropatfa/brain.git ~/.local/brain-engine
mkdir -p ~/.claude/skills && cp -R ~/.local/brain-engine/skills/brain ~/.claude/skills/brain
```
```powershell
# Windows (no admin): copy, or make a directory junction
git clone https://github.com/kooropatfa/brain.git $env:USERPROFILE\.local\brain-engine
Copy-Item -Recurse -Force $env:USERPROFILE\.local\brain-engine\skills\brain $env:USERPROFILE\.claude\skills\brain
```

**Headless / CI / no browser** — instead of the browser sign-in, set a `GH_TOKEN` environment variable
(a classic `repo`+`workflow` token, or a fine-grained Contents+PRs read/write token on your Brain repo):
- Windows: `[Environment]::SetEnvironmentVariable('GH_TOKEN','<token>','User')`, then reopen the terminal.
- macOS/Linux: add `export GH_TOKEN=<token>` to your shell profile.
</details>

<details><summary><b>What's inside the skill folder</b></summary>

| File | What it's for |
|---|---|
| `SKILL.md` | the agent's instructions (quick start, sync, read, save, the loop) |
| `brain.example.yml` | copy-to-configure template |
| `references/configuration.md` | the config layers + every knob |
| `references/brain-sync-cli.md` | the brain-sync CLI in full |
| `references/schema-v1.md` | the capture format + how to validate it |
| `references/capture-cookbook.md` | a worked example for every kind of source |
| `references/reading-the-brain.md` | how the agent navigates the vault |
| `references/proactive-capture.md` | when the agent offers to save something |
| `references/ingestion-behavior.md` | what happens to a capture after you save it |
</details>
