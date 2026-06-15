# Configuring the skill

The skill works with **zero config**. Everything below is optional — change something only when the
default isn't what you want.

## Two kinds of settings
- **Shared facts** (which Brain repo, its dimensions, the default branch) live in **`brain.config.yml`**
  inside the Brain repo. The whole team shares these; don't duplicate them.
- **Behavior + paths** (auto-pull, proactive offers, your reading focus, where the clone lives) live in
  an optional **`brain.yml`**. This is what you tweak.

## Where to put config files
Copy `brain.example.yml` (ships with this skill) to any or all of these locations:

| File | Scope | Commit it? |
|---|---|---|
| `~/.config/brain.yml` | machine-wide, all Brains | no — personal |
| `~/.config/<name>.yml` | machine-wide, one specific Brain | no — personal |
| `<project>/brain.yml` | project-wide, all Brains bound here | yes |
| `<project>/<name>.yml` | project-wide, one specific Brain | yes |

Personal files live **outside** every Brain clone, so a `brain-sync` pull never overwrites them.
`<name>` is the Brain's clone directory name (= what you put in `.brains.yml`, e.g. `mybrain`).

## Precedence (low → high, later wins)

The hooks load knobs per-brain in four layers — each layer overrides the previous:

```
~/.config/brain.yml          (machine-wide generic defaults)
~/.config/<name>.yml         (machine-wide per-brain, e.g. ~/.config/mybrain.yml)
<project>/brain.yml          (project-wide shared, committed)
<project>/<name>.yml         (project-wide per-brain override, committed)
```

So: a team default committed in the project's `brain.yml` (e.g. `proactive: false`) applies to every
contributor on that project and overrides any personal `~/.config/brain.yml` setting — project beats
personal. A person's `~/.config/mybrain.yml` sets their machine-wide preference for the mybrain Brain in
projects that don't pin it themselves. And a project's `<name>.yml` (e.g. `mybrain.yml` at the project
root) is the most specific layer and always wins — it beats both the generic project `brain.yml` and
any personal file. Brain-specific files (`<name>.yml`) only affect the named Brain; generic `brain.yml`
applies to all Brains bound in that scope.

## How the skill reads it
At session start the SessionStart hook resolves knobs per-brain by merging the four layers above. To
inspect what each layer contributes:
```bash
# macOS / Linux (replace <name> with your Brain's name, e.g. mybrain)
cat ~/.config/brain.yml 2>/dev/null            # machine generic
cat ~/.config/<name>.yml 2>/dev/null           # machine per-brain
cat brain.yml 2>/dev/null                       # project generic
cat <name>.yml 2>/dev/null                      # project per-brain
node "<plugin>/tools/brain-sync/brain-sync.mjs" config --brain <name>   # remote/branch/token facts
```
```powershell
# Windows
Get-Content "$HOME\.config\brain.yml" -ErrorAction SilentlyContinue
Get-Content "$HOME\.config\<name>.yml" -ErrorAction SilentlyContinue
Get-Content .\brain.yml -ErrorAction SilentlyContinue
Get-Content .\<name>.yml -ErrorAction SilentlyContinue
node "<plugin>\tools\brain-sync\brain-sync.mjs" config --brain <name>
```
(`brain-sync config --brain <name>` prints the resolved repo/branch/brain_dir and whether a token is
present. The `brain.yml` / `<name>.yml` layers add the behavior knobs on top.)

## The knobs (all optional)
| Key | Default | What it does |
|---|---|---|
| `brain_dir` | `~/.brain/<name>` | where the local clone lives (same as `$BRAIN_DIR`). Honored only from name-specific layers — `~/.config/<name>.yml` and project `<name>.yml`; ignored in generic `brain.yml` (a generic clone path would map every bound Brain onto one clone). |
| `auto_pull` | `true` | pull on session start; `false` = use the existing clone as-is. |
| `preflight` | `quiet` | `quiet` (one line / silent) · `off` (silent) · `verbose` (always report). |
| `proactive` | `true` | whether the agent offers to save things on its own. `false` = only on your command. |
| `offer_cap` | `2` | max proactive offers per session (`0` = same as `proactive: false`). |
| `dimensions` | `[]` (all) | which dimension folders the agent reads first — e.g. `[technical, product]`. |
| `session_capture` | `off` | `on` = the SessionEnd hook distils durable knowledge from each finished session into a Brain capture + PR. Commit `on` in a work repo's `brain.yml` to enable it for the whole team there. |
| `session_capture_model` | `haiku` | model for the end-of-session summarizer call. |
| `session_capture_min_lines` | `30` | transcripts shorter than this skip the summarizer entirely. |
| `config_path` | — | override `brain.config.yml` discovery (same as `$BRAIN_CONFIG`). |
| `token_env` | `GH_TOKEN` | name of the env var holding the GitHub token. Honored only from name-specific layers — `~/.config/<name>.yml` and project `<name>.yml`; ignored in generic `brain.yml`. |

## Examples

**A backend engineer who finds offers noisy:** `~/.config/brain.yml`
```yaml
proactive: false
dimensions: [technical, product]
```

**A team that wants offers on and the clone in a custom spot:** behavior knobs go in the generic
`<project>/brain.yml`:
```yaml
proactive: true
offer_cap: 3
```
…but `brain_dir` is an identity knob — it only counts in a name-specific file, e.g. `<project>/mybrain.yml`:
```yaml
brain_dir: ~/work/mybrain
```

**Someone offline a lot:** `~/.config/brain.yml`
```yaml
auto_pull: false
preflight: off
```

## Multi-brain machines: `.brains.yml`
Which Brain a project uses is NOT a knob in `<name>.yml` — it lives in a separate, brain-agnostic
binding file that every installed Brain plugin reads:

| File | Scope | Commit it? |
|---|---|---|
| `<project>/.brains.yml` | per-project binding | yes |
| `~/.config/brains.yml` | machine-wide fallback | no |

Format — one key:
```yaml
use: [personal]               # this project's Brain(s); names = clone dir basenames under ~/.brain/
# use: [personal, work]       # several Brains allowed; the agent asks which one per save
# use: []                     # explicitly no Brain in this project
```
Unbound project: the plugin's single SessionStart hook prints one line listing the machine's Brains
and the agent asks once, then saves the answer here. Bound project: other Brains stay completely silent,
`brain-sync contribute` refuses to push to a Brain the project doesn't bind (`--force-unbound`
overrides), and the SessionEnd auto-capture is gated the same way.

## Ingestion mode (`brain.config.yml`)
`ingestion: local` (default) — no API key anywhere: the session agent does the classify/distil/file
step itself and opens a single `Ingest:` PR (SKILL.md, "Local ingestion"); the CI pipeline gates
itself off. `ingestion: action` — a GitHub Actions pipeline with an `ANTHROPIC_API_KEY` secret
classifies and files captures pushed to `_inbox/`. A shared fact — set it in the Brain repo, never
per person.
