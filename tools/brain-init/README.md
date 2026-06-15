# brain-init — scaffold a new Brain knowledge repo

Generates a **pure-data** knowledge repo from the tokenized templates in `templates/`: the
`brain.config.yml`, one folder + MOC note per dimension, the fixed infrastructure folders
(`_inbox/`, `decisions/`, `_attachments/`), the glossary stub, a member-facing README, the
committed Obsidian vault config and a `.gitignore`. The engine never lives in the result; it stays
in this plugin. Dependency-free Node, like every tool in this repo.

## Usage

```bash
node tools/brain-init/brain-init.mjs --name mybrain --org <your-github-user> \
  [--company "Display Name"] [--dimensions "technical:archi & infra,craft:woodworking notes"] \
  [--ingestion local|action] [--dir <target-dir>]
```

The scaffolder prints the exact next steps when it finishes: `git init` + commit, `gh repo create
--private --push`, `brain-sync connect --repo <owner>/<name>`, and the `.brains.yml` project
binding (plus the `ANTHROPIC_API_KEY` secret in `action` mode).

## Flags

| Flag | Required | Default | Meaning |
|---|---|---|---|
| `--name <brain-name>` | yes | — | the Brain's name: repo basename, clone dir under `~/.brain/<name>`, the `.brains.yml` binding name. Lowercase `[a-z0-9._-]`, no spaces |
| `--org <github-org-or-user>` | yes | — | GitHub owner of the knowledge repo; `repo:` in `brain.config.yml` becomes `<org>/<name>` |
| `--company "<Display Name>"` | no | the `--org` value | display name used in the README and config headers |
| `--dimensions "name:blurb,..."` | no | the standard five (technical, business, product, design, user) | comma-separated `name:blurb` pairs; each becomes a top-level folder with its MOC `index.md`. Blurb optional (`name` alone works). Names must match `[a-z0-9][a-z0-9._-]*` (no leading `.`/`_`, no slashes), be unique, and must not be `_inbox`, `_attachments` or `decisions` (fixed infrastructure folders) — otherwise the scaffolder dies before writing anything. Blurbs may contain `:`/`#`/quotes; they are double-quoted in the generated YAML |
| `--ingestion local\|action` | no | `local` | `local`: the session agent classifies captures, zero CI. `action`: the GitHub Actions pipeline; copies the three shim workflows from `templates/workflows/` into the repo's `.github/workflows/` |
| `--dir <target-dir>` | no | `./<name>` | where to scaffold; must not exist or must be empty |

## Templates

- `templates/skeleton/` — copied as the repo root; `.md`/`.yml`/`.json`/`.gitignore` files are
  rendered (`{{NAME}}`, `{{REPO}}`, `{{COMPANY}}`, `{{COMPANY_YML}}`, `{{INGESTION}}`,
  `{{DIMENSIONS_YML}}`, `{{DIMENSIONS_TABLE}}`), everything else is copied verbatim.
  `{{COMPANY}}` is the raw display name for prose; `{{COMPANY_YML}}` is the same value
  double-quoted/escaped for YAML scalar positions (used in `brain.config.yml`).
- `templates/dimension-index.md` — the per-dimension MOC, rendered once per dimension with
  `{{DIM}}` and `{{BLURB}}`.
- `templates/workflows/` — the three CI shims, copied only with `--ingestion action`. If the
  directory is missing the scaffolder fails fast with a clear error instead of producing a broken
  action-mode repo.
