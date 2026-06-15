# 🧠 brain

**Your coding agent, plugged into the company's shared knowledge.**

Install once. From then on, every coding session your agent:
- **knows what the company knows** — it reads the Brain before doing non-trivial work, so it doesn't
  re-litigate decisions or miss a spec;
- **remembers the good stuff** — when something worth keeping comes up, just say *"add this to the
  brain"* (a decision, a doc, a PDF, an email, a Slack thread, a screenshot, a rough idea) and it files
  it for you. No format to learn, no repo to find.

You stop being the person who has to remember to write things down.

---

## Install (2 minutes, once per machine)

Two steps: a one-paste prerequisites command, then two lines inside Claude Code. **No token to
copy, no symlink, no files to edit.** Same on every OS.

### Step 1 — prerequisites (one paste)

This installs Node + Git + the GitHub CLI (if missing) and signs you in to GitHub **in your browser**
(no token). Pick your OS:

<details open><summary><b>Windows</b> (PowerShell — Start menu → type "PowerShell" → Enter)</summary>

```powershell
irm https://raw.githubusercontent.com/kooropatfa/brain/main/install.ps1 | iex
```
Nervous about running a script from the internet (or your antivirus blocks it)? Download and read it
first: `irm https://raw.githubusercontent.com/kooropatfa/brain/main/install.ps1 -OutFile install.ps1`,
open it in Notepad, then `powershell -ExecutionPolicy Bypass -File .\install.ps1`.
</details>

<details><summary><b>macOS / Linux</b> (Terminal)</summary>

```bash
curl -fsSL https://raw.githubusercontent.com/kooropatfa/brain/main/install.sh | bash
```
</details>

### Step 2 — turn on the skill (inside Claude Code)

Open Claude Code and run these two lines (identical on every OS):

```
/plugin marketplace add kooropatfa/brain
/plugin install brain@brain
```

Done. Open a project and your agent picks it up automatically. The skill ships in the plugin (not in
any Brain clone), so it auto-updates from the marketplace — nothing to keep current manually.

### Connect an existing Brain

If you already have a Brain repo (or are joining a team Brain), connect it without cloning manually:

```
brain-sync connect --repo <owner/name>
```

This clones the Brain to `~/.brain/<name>`; the clone brings its own `brain.config.yml` (created by
`brain-init`). Connect warns if it is missing — without it, `read`/`config`/`contribute --brain` will
refuse to run. Then bind it in your project: add a `.brains.yml` at the project root with `use: [<name>]`.

### Verify it worked

Ask your agent in Claude Code: *"is my brain connected?"* — or run:

```
node <plugin>/tools/brain-sync/brain-sync.mjs config --brain <name>
```
Expect a line of JSON with `"repo":"<owner/name>"` and `"token_present":true`.

<details><summary><b>Advanced / fallback</b> (no plugin, or a persistent token)</summary>

**No plugin (locked-down machine / no marketplace):** install the plugin from the engine repo and copy
the skill from there (not from a Brain clone — knowledge clones contain no engine code; re-copy after
each engine update):
```bash
git clone https://github.com/kooropatfa/brain.git ~/.local/brain-engine
mkdir -p ~/.claude/skills && cp -R ~/.local/brain-engine/skills/brain ~/.claude/skills/brain
```
```powershell
# Windows (no admin): copy, or a directory junction
git clone https://github.com/kooropatfa/brain.git $env:USERPROFILE\.local\brain-engine
Copy-Item -Recurse -Force $env:USERPROFILE\.local\brain-engine\skills\brain $env:USERPROFILE\.claude\skills\brain
# or: cmd /c mklink /J "%USERPROFILE%\.claude\skills\brain" "%USERPROFILE%\.local\brain-engine\skills\brain"
```

**Persistent token instead of `gh auth login`** (CI / headless / no browser): set `GH_TOKEN` (a
`repo`+`workflow` classic PAT, or fine-grained Contents+PRs RW on your Brain repo).
- Windows: `[Environment]::SetEnvironmentVariable('GH_TOKEN','<token>','User')` then reopen the terminal.
  (`setx GH_TOKEN "<token>"` works too but truncates tokens over 1024 chars.)
- macOS/Linux: `export GH_TOKEN=<token>` in your shell profile.
</details>

---

## Using it (there's almost nothing to learn)

- **Read:** just work. The agent consults the Brain on its own when it matters.
- **Save:** say it in plain words — *"add this to the brain"*, *"throw this in the brain"*, *"save this
  to the Brain"*. Point at anything: a note, a PDF, an email, a Notion/Slack link, a screenshot, or even
  *"that thing we just figured out."* The agent writes it up, opens a PR, and the pipeline files it.
- **That's the loop.** You'll get a PR link as confirmation. You never touch the format or merge anything.

---

## Make it yours (optional)

Everything works with **zero config**. To tweak it, copy `brain.example.yml` to either:
- `~/.config/brain.yml` — **your personal** settings (private; never overwritten by updates), or
- `<your project>/brain.yml` — settings the **team** shares for that project.

Common tweaks:
```yaml
proactive: false           # don't offer to save things unprompted — I'll ask when I want to
dimensions: [technical]    # focus my reading on the parts I work in
auto_pull: false           # I'm often offline; don't pull on every session start
```
Full list of knobs and how the layers stack: `references/configuration.md`.

---

## How it fits together

The skill is a thin wrapper over two tools that ship in the **engine plugin** (`kooropatfa/brain`):
- **brain-sync** (`tools/brain-sync/`) — clones/pulls a Brain knowledge repo and opens PRs from your edits.
- **the ingestion pipeline** (`.github/workflows/`) — turns a raw capture into a clean, filed, cross-linked note.

The engine (tools, hooks, skill) lives entirely in the installed plugin. Knowledge repos (`~/.brain/<name>`)
contain only Markdown notes and `brain.config.yml` — no engine code. The plugin auto-updates from the
marketplace — no separate thing to keep current. (The no-plugin fallback copies the skill from the engine
repo; re-copy it after an engine update, not from a Brain clone.)

**Architecture:** one Brain clone per machine per knowledge repo (`~/.brain/<name>`), shared across all
your projects. Not a per-project submodule, not a monorepo — just sibling clones every project can reach.

### What's inside
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
