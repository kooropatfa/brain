# SETUP — create and run your own Brain

This repo is the Brain **engine** (open source — see `LICENSE`, `CONTRIBUTING.md`): a Claude Code
plugin plus the scaffolder and pipeline machinery. A **Brain** is a separate, (usually private)
**knowledge repo** — pure data, no engine files — that the plugin syncs, reads and feeds. This
file walks you from nothing to a working private Brain wired into Claude Code.

## 1. Scaffold your knowledge repo

```bash
node tools/brain-init/brain-init.mjs --name mybrain --org <your-github-user> --company "<Display Name>"
cd mybrain && git init -b main && git add -A && git commit -m "init brain: mybrain"
```

`brain-init` generates the skeleton: `brain.config.yml`, the dimension folders with their MOC
notes, `decisions/`, `_inbox/`, `_attachments/`, the glossary stub, a member-facing README and the
committed Obsidian vault config. Flags (`--dimensions`, `--ingestion`, `--dir`):
[`tools/brain-init/README.md`](./tools/brain-init/README.md). The engine never lives in the
result — there is nothing to stamp and nothing to keep in sync.

## 2. Push it private (+ Action secrets, action mode only)

```bash
gh repo create <your-github-user>/mybrain --private --source . --push
```

The default ingestion mode is `local`: zero API spend, zero CI — your session agent classifies and
files captures itself. If you scaffolded with `--ingestion action` (the GitHub Actions pipeline;
the repo then carries three thin shim workflows), add the secrets:

```bash
gh secret set ANTHROPIC_API_KEY --repo <your-github-user>/mybrain   # required: headless ingestion classifier
gh secret set SLACK_WEBHOOK_URL --repo <your-github-user>/mybrain   # optional: review-channel pings
```

In `action` mode without the key, captures simply wait in the knowledge repo's `_inbox/`. You can
switch modes later by editing `ingestion:` in the repo's `brain.config.yml`.

## 3. Install the plugin (once per machine)

```
/plugin marketplace add kooropatfa/brain
/plugin install brain@brain
```

One plugin serves every Brain on the machine — install it once, it auto-updates. Then connect the
machine to your Brain (requires a signed-in `gh`, or a `GH_TOKEN`):

```
brain-sync connect --repo <your-github-user>/mybrain
```

This clones the knowledge repo to `~/.brain/<name>` (the clone's basename **is** the brain's
name — `mybrain` here).

## 4. Bind projects — no Brain acts globally

One machine can host several Brains (work + private + per venture). Each project declares which
one(s) it uses, in `.brains.yml` at the project root:

```yaml
use: [mybrain]         # names = clone basenames under ~/.brain/; [] = no Brain here
```

- **Unbound project:** at session start the plugin's hook prints one line listing the machine's
  Brains and the agent asks you once, then saves your answer to `.brains.yml`.
- **Bound project:** all other Brains stay completely silent; `brain-sync contribute` refuses to
  push to a Brain the project doesn't bind; the SessionEnd auto-capture is gated the same way.
- Machine-wide fallback: `~/.config/brains.yml`.

## 5. Per-project behavior

`<name>.yml` (e.g. `mybrain.yml`) in a project root — committable — plus personal
`~/.config/<name>.yml`. Useful knobs: `dimensions: [business, product]` (reading focus),
`proactive`, `offer_cap`, `session_capture: on` (auto-capture each session's durable knowledge).
Full list: `skills/brain/references/configuration.md`.

## 6. Staying up to date

Knowledge repos contain **no engine** — there is nothing in them to update. Updating the engine =
updating the plugin, which Claude Code does automatically (or re-run `/plugin install
brain@brain`). In `action` mode, the shim workflows in the knowledge repo call the engine's
reusable workflows pinned to the MOVING major tag `@v1` — `v1` advances with every compatible
engine release, so CI upgrades arrive automatically with no shim edits. Pin a commit SHA instead of
`v1` to freeze; a breaking engine release ships as `@v2` (opting in is a one-line shim edit). Fixed
something in the engine? PR it here — knowledge repos are never involved (see `CONTRIBUTING.md`).
