# brain-sync CLI reference

`tools/brain-sync/brain-sync.mjs` inside the plugin repo. Pure Node (no `npm install`); shells out to
`git` and (for `contribute`) `gh`. Addresses a Brain by name (`--brain <name>`) — knowledge repos
contain no engine code; the plugin is installed once and serves all bound Brains.

## Commands

| Command | Network | stdout | What it does |
|---|---|---|---|
| `connect --repo <owner/name>` | yes | the local Brain path | First clone of a knowledge repo onto this machine. Clones into `~/.brain/<name>`, scrubs the auth token from origin's remote URL, warns if `brain.config.yml` is absent. No-op (prints path) if already cloned. |
| `read` | yes | the local Brain path | clone-or-pull. If a clone exists: `git checkout <default_branch>` then `git pull --ff-only`. Else `git clone`. Idempotent. |
| `contribute --message "<t>"` | yes | the PR URL | branch off default -> `git add -A` -> commit (+ agent trailer) -> push -> `gh pr create`. Never merges. |
| `path` | no | the local Brain path | resolves `$BRAIN_DIR` else `~/.brain/<name>`. Works even before the clone exists (pure local computation). |
| `config` | no | JSON | `{config_file, repo, default_branch, token_env, token_present, brain_dir}`. |
| `help` / `-h` | no | usage | — |

## Brain addressing: `--brain <name>`

All commands accept `--brain <name>` to address a Brain directly by its clone directory name under
`~/.brain/`. No project-level config needed; the clone's own `brain.config.yml` names the remote.

```
--brain <name>   address ~/.brain/<name>; the clone's brain.config.yml names the remote
(fallback)       walk UP from $PWD looking for brain.config.yml (legacy, backward-compatible)
```

- `path --brain <name>` works **before** the clone exists (pure local computation).
- `config --brain <name>`, `read --brain <name>`, `contribute --brain <name>` die with a
  `connect --repo` hint when `~/.brain/<name>` is missing.

## `connect` command

```
brain-sync connect --repo <owner/name> [--brain <name>]
```

- `--repo <owner/name>` — **required**. The GitHub knowledge repo to clone.
- `--brain <name>` — optional; overrides the default name (= repo basename).
- Clones into `~/.brain/<name>`, then scrubs the auth token from the stored remote URL.
- Warns (stderr) if the cloned repo contains no `brain.config.yml`.
- Already cloned: prints the existing path and exits 0 (no-op).
- `<dir> exists and is not a Brain clone — refusing to overwrite` on any non-clone existing dir.

### `contribute` flags
- `--message "<title>"` / `-m` — **required**; becomes the commit message and PR title.
- `--branch <name>` — default `brain-sync/<slug>-<hash>` (slug from the message; hash from the diff so
  repeated runs don't collide).
- `--body <text>` — PR body; defaults to the message.
- `--base <branch>` — PR base; defaults to config `default_branch`.
- `--dry-run` — commit locally on the branch, **skip** push + PR. stdout = the local branch name.
- `--force-unbound` — override the `.brains.yml` binding guard.

## stdout vs stderr (important for scripting)
- **stdout** carries the result only: the path (`connect`/`read`/`path`), the PR URL (`contribute`),
  or the JSON (`config`). Capture it: `BRAIN=$(node …/brain-sync.mjs read --brain <name>)`.
- **stderr** carries every `brain-sync: …` status/log line. Don't parse it as the result.

## Exit codes
- `0` success.
- `1` any `die()` — examples: `pull failed: <git err>` (not fast-forward → DIVERGED), `clone failed`,
  `no brain.config.yml found`, `brain.config.yml must set 'repo: owner/name'`, `no local changes …`
  (nothing to contribute), `no token in $GH_TOKEN and 'gh auth token' empty — cannot push`,
  `<dir> exists and is not a Brain clone — refusing to overwrite`,
  `no Brain named '<name>' on this machine ... Run: brain-sync connect --repo <owner/name>`.
- `2` `help` with no command.

## Config discovery (fallback mode, works from any directory)
Used when `--brain` is not provided (legacy single-Brain behaviour):
1. `--config <file>` → 2. `$BRAIN_CONFIG` → 3. `brain.config.yml` found by walking **up** from `$PWD`.
Only top-level **scalar** keys are read: `repo` (required, `owner/name`), `default_branch` (default
`main`), `token_env` (default `GH_TOKEN`). It deliberately does not parse YAML arrays.

## Environment overrides
| Var | Purpose | Default |
|---|---|---|
| `BRAIN_CONFIG` | explicit path to `brain.config.yml` (fallback mode only) | found by walking up |
| `BRAIN_DIR` | where the Brain clone lives | `~/.brain/<name>` |
| `BRAIN_TOKEN_ENV` | name of the env var holding the token | config `token_env` / `GH_TOKEN` |
| `BRAIN_AGENT_TRAILER` | commit trailer for agent attribution; set to empty to omit | Claude Code trailer |

## Token handling
Resolution order: the configured env var (default `$GH_TOKEN`) → fallback `gh auth token`. Used for both
`git push` over HTTPS and `gh pr create`. **Never written to disk, never printed** — for git ops it's
injected into the remote URL only for the duration of the push/pull, then scrubbed from `.git/config`.
The simplest setup is **`gh auth login`** (browser) — no token to manage, and it covers both push and PR
via the `gh auth token` fallback. If you'd rather use a token, a `repo`+`workflow` classic PAT (or
fine-grained `Contents:RW`+`Pull requests:RW`) works; set it once so every session inherits it —
macOS/Linux: `export GH_TOKEN=…` in your shell profile; Windows:
`[Environment]::SetEnvironmentVariable('GH_TOKEN','…','User')`.

## Typical agent flow
```bash
BRAIN=$(node "<plugin>/tools/brain-sync/brain-sync.mjs" read --brain <name>)   # sync + get path
# ... read files under $BRAIN ... or write a capture to $BRAIN/_inbox/<file>.md ...
node "<plugin>/tools/brain-sync/brain-sync.mjs" contribute --brain <name> --message "Capture: <title>"
```
Note: `contribute` operates on the **Brain clone** (`~/.brain/<name>`), not your project. Edit files
under the path `read` prints, then `contribute` from anywhere.

## `.brains.yml` binding guard (contribute)
A project declares its Brain(s) in a `.brains.yml` (`use: [<names>]`, walking up from cwd; fallback
`~/.config/brains.yml`). `contribute` refuses to push to a Brain the project does not bind;
`--force-unbound` overrides — use it only on the user's explicit say-so. No binding file at all =
allowed (single-brain machines need zero ceremony).
