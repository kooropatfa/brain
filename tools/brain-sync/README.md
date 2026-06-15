# brain-sync — the agent↔Brain connection

A small, dependency-free helper that connects **any** agent session in **any** project to a Brain
(a knowledge repo of Markdown; see the [repo README](../../README.md)). It ships inside the Brain
**engine plugin** — installed once per machine, it serves every Brain on it; knowledge repos
contain no engine code. It does three things:

- **connect** — first clone of a knowledge repo onto this machine (into `~/.brain/<name>`).
- **read** — clone-or-pull a Brain into its known local path, so an agent can load the relevant
  knowledge into context.
- **contribute** — from a local edit, branch + commit + open a **pull request** against the Brain
  repo, so machine-written knowledge is reviewed like code (diffed, attributed, reversible).

Brains are addressed by name: `--brain <name>` targets the clone under `~/.brain/<name>`, whose own
`brain.config.yml` names the remote — no project-level config needed. Without `--brain`, the helper
falls back to the legacy walk-up mode (see Configuration below).

This README is the short tour. The full command / flag / exit-code reference lives with the skill:
[`skills/brain/references/brain-sync-cli.md`](../../skills/brain/references/brain-sync-cli.md).

## Requirements

- `node` (uses only the standard library — no `npm install`)
- `git`
- `gh` (GitHub CLI) — only for `contribute` (opening the PR)
- A GitHub token in an environment variable (default `GH_TOKEN`); falls back to `gh auth token`.

## The commands

### Connect a Brain (first clone on this machine)

```bash
node tools/brain-sync/brain-sync.mjs connect --repo owner/name
```

Clones the knowledge repo into `~/.brain/<name>` (name = the repo basename; override with
`--brain <name>`), scrubs the auth token from the stored remote URL, and warns if the repo carries
no `brain.config.yml`. Already cloned: prints the existing path and exits 0 (no-op).

### Read the Brain (clone-or-pull)

```bash
node tools/brain-sync/brain-sync.mjs read --brain <name>
```

Clones the Brain on first run, pulls (`--ff-only`) on every run after — **idempotent**. Prints the
local path on stdout (default `~/.brain/<name>`). That path is where you read and, for a
contribution, edit the Brain.

### Contribute to the Brain (branch → commit → PR)

```bash
# 1. get / refresh the local clone
node tools/brain-sync/brain-sync.mjs read --brain <name>

# 2. edit the Brain at the printed path, e.g.
#    $(node tools/brain-sync/brain-sync.mjs path --brain <name>)/decisions/ADR-0007-foo.md

# 3. open a PR with your edits — this is the single contribute command
node tools/brain-sync/brain-sync.mjs contribute --brain <name> --message "Add ADR-0007: foo decision"
```

`contribute` creates a branch off the Brain's default branch, commits all local changes in the clone
(with the Claude co-author trailer), pushes, and opens a PR. It prints the **PR URL** on stdout. It
never merges — review and merge happen in the Brain repo, by a human (per the Brain deploy gate).

Options: `--branch <name>` (default `brain-sync/<slug>-<hash>`), `--body <text>`, `--base <branch>`
(default = config `default_branch`), `--dry-run` (commit locally, skip push + PR).

### Inspect (no network)

```bash
node tools/brain-sync/brain-sync.mjs config --brain <name>  # resolved repo, branch, token var, local path
node tools/brain-sync/brain-sync.mjs path --brain <name>    # just the local Brain path (works pre-clone)
```

## Configuration

With `--brain <name>` there is nothing to configure in your project: the clone's **own**
`brain.config.yml` (scaffolded by `brain-init`) names the remote:

```yaml
repo: owner/name          # REQUIRED — the knowledge repo this Brain syncs with
default_branch: main      # optional, default "main"
token_env: GH_TOKEN       # optional, default "GH_TOKEN" — name of the env var holding the token
```

**Legacy walk-up mode** (no `--brain` given): the helper finds a `brain.config.yml` by walking up
from the current directory (override with `--config` or `$BRAIN_CONFIG`). Kept as the
backward-compatible fallback for pre-plugin setups; prefer `--brain <name>`.

Environment overrides:

| Variable          | Purpose                                              | Default                  |
|-------------------|------------------------------------------------------|--------------------------|
| `BRAIN_CONFIG`    | explicit path to `brain.config.yml` (walk-up mode)   | found by walking up      |
| `BRAIN_DIR`       | where the Brain is cloned (the "known local path")   | `~/.brain/<name>`        |
| `BRAIN_TOKEN_ENV` | name of the env var that holds the token             | config `token_env` / `GH_TOKEN` |

## Auth & token handling

The token is read from the configured env var (default `$GH_TOKEN`); if unset, the helper falls back to
`gh auth token`. It is used for both `git push` over HTTPS and `gh pr create`. The token is **never
written to disk and never printed** — for git operations it is injected into the remote URL only for
the duration of the push/pull and then scrubbed from `.git/config`.

## Design notes

- **Pure Node, no dependencies** — atomic commits with the Claude co-author trailer; nothing to
  `npm install`.
- **Scalar-only config reader.** The helper reads only the top-level scalar keys it needs (`repo`,
  `default_branch`, `token_env`). It deliberately does **not** parse YAML arrays or block lists, so it
  cannot mis-handle a list value (the inline-array pitfall that affected a different, array-parsing
  tool in this project). If `brain.config.yml` ever needs a list for brain-sync, add a parser then.
- **No coupling to repo structure.** brain-sync targets the Brain as an external repo over HTTPS; it
  does **not** use a Git submodule (rejected for the MVP) or a live Obsidian-MCP vault (deferred). It
  works whether or not the consuming project has decided how to mount the Brain.
- **Out of scope:** the automatic ingestion Action (that's the `_inbox/` → classify → PR pipeline);
  brain-sync is for interactive/agent contributions, not the inbox pipeline.

## `.brains.yml` binding guard (contribute)
On multi-brain machines a project declares its Brain(s) in a `.brains.yml` (`use: [<names>]`,
walking up from cwd; fallback `~/.config/brains.yml`). `contribute` refuses to push to a Brain the
project does not bind; `--force-unbound` overrides — use it only on the user's explicit say-so.
No binding file at all = allowed (single-brain machines need zero ceremony).
