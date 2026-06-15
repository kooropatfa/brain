# inbox-watch — drop a file in a folder, the Brain assimilates it

`inbox-watch.mjs` gives the Brain a **Dropbox feel** on any machine: it watches a plain local
folder, and every file you drop there (PDF, screenshot, note, transcript — anything) is moved into
the Brain clone's `_inbox/`, **formatted locally** into a schema-v1 capture, committed, and pushed
to the default branch. The push fires the ingestion Action, and the classifier distils + files it.
You drag a file; a reviewed PR with clean knowledge comes out the other end.

The formatting stage runs **before the push**, on your machine — the same normalizer the Action
uses (`tools/normalizer/normalize-drops.mjs`, here in `--worktree` mode): text files are embedded
verbatim into a capture body, PDFs/images are parked in `_attachments/` with a capture stub
pointing the classifier at them, unreadable formats get a capture carrying a question for the
steward (the ingest PR opens ready for review, labeled `needs-human`). So what lands on the branch is already the
one shape the pipeline speaks. If local formatting ever fails, the raw file is pushed anyway — the
Action runs the same normalizer in range mode as the backstop; nothing is lost either way.

No Obsidian needed, no git knowledge needed. This is the third drop point next to the Obsidian
vault (Obsidian Git auto-pushes) and GitHub web drag-&-drop (a push by itself — those two rely on
the Action-side backstop for formatting).

```
~/Brain-Inbox/deck.pdf  →  inbox-watch (move → NORMALIZE → commit+push)
                        →  _inbox/other-….md + _attachments/deck.pdf @ default branch
                        →  ingestion Action (classify → PR)  →  steward merges
```

## Run it

```bash
# watch the clone's own _inbox/ (default), scan every 30s
node ~/.local/brain-engine/tools/inbox-watch/inbox-watch.mjs --brain ~/.brain/<clone>

# watch a friendlier folder instead
node ~/.local/brain-engine/tools/inbox-watch/inbox-watch.mjs --brain ~/.brain/<clone> --drop ~/Brain-Inbox

# one scan + push, then exit (for cron-style schedulers and for testing)
node ~/.local/brain-engine/tools/inbox-watch/inbox-watch.mjs --brain ~/.brain/<clone> --drop ~/Brain-Inbox --once
```

`<ENGINE>` below refers to the brain engine directory — either `~/.local/brain-engine` (a stable
`git clone https://github.com/kooropatfa/brain.git ~/.local/brain-engine`, the same path the
no-plugin install uses) or the installed plugin's directory. The engine contains `tools/` and
`skills/`; Brain clones under `~/.brain/` do **not** have a `tools/` directory.

| Flag / env | Default | Meaning |
|---|---|---|
| `--brain` / `$BRAIN_DIR` | the single clone under `~/.brain` | the Brain clone to commit into |
| `--drop` / `$DROP_DIR` | the clone's `_inbox/` | the folder to watch |
| `--engine` / `$BRAIN_ENGINE` | auto-discovered plugin / sibling | the engine dir containing `tools/normalizer` and `tools/inbox-watch`; set explicitly in service files where the shell profile is not loaded |
| `--interval <s>` | `30` | scan interval |
| `--once` | — | single scan, then exit |

Prerequisites: Node 20+, a Brain clone (`brain-sync read` creates one), and a GitHub token in the
env var named by `token_env:` in `brain.config.yml` (default `GH_TOKEN`; falls back to
`gh auth token`). Same auth story as brain-sync — the token is injected into the remote URL only
for the push, then scrubbed; it is never written to disk.

Behavior worth knowing:

- A file is only picked up when **stable** — same size + mtime across two consecutive scans — so a
  file still being copied is never pushed half-done.
- Files **>50MB are skipped** (with a warning): the Brain is a knowledge vault, not blob storage.
  Host big artifacts elsewhere and drop a note with the link instead.
- Dotfiles and temp/partial files (`~$report.docx`, `*.part`, `*.crdownload`, `*.tmp`, `*.swp`)
  are ignored.
- A **diverged clone is never touched** — the watcher logs a warning and skips the cycle; reconcile
  the clone yourself (same rule as brain-sync).
- Name collisions in `_inbox/` get a short suffix; the normalizer renames everything to capture
  convention anyway.

## Install as a background service

The same script runs everywhere; only the service wrapper differs. All three variants below run the
watcher at login with `--drop ~/Brain-Inbox` — adjust paths (and the Node path: `which node` /
`Get-Command node`) to your machine. The service environment must contain your `GH_TOKEN` (or the
var named by `token_env:`), because login shells' profile files are not always loaded by service
managers.

### macOS — launchd

`~/Library/LaunchAgents/com.brain.inbox-watch.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.brain.inbox-watch</string>
  <key>ProgramArguments</key><array>
    <string>/usr/local/bin/node</string>
    <string>/Users/YOU/.local/brain-engine/tools/inbox-watch/inbox-watch.mjs</string>
    <string>--brain</string><string>/Users/YOU/.brain/brain</string>
    <string>--engine</string><string>/Users/YOU/.local/brain-engine</string>
    <string>--drop</string><string>/Users/YOU/Brain-Inbox</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>GH_TOKEN</key><string>ghp_your_token_here</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>/tmp/inbox-watch.log</string>
</dict></plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.brain.inbox-watch.plist   # start now + at every login
tail -f /tmp/inbox-watch.log                                          # watch it work
```

### Linux — systemd (user unit)

`~/.config/systemd/user/inbox-watch.service`:

```ini
[Unit]
Description=Brain inbox watcher

[Service]
ExecStart=/usr/bin/node %h/.local/brain-engine/tools/inbox-watch/inbox-watch.mjs --brain %h/.brain/brain --engine %h/.local/brain-engine --drop %h/Brain-Inbox
Environment=GH_TOKEN=ghp_your_token_here
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
```

```bash
systemctl --user enable --now inbox-watch.service
journalctl --user -u inbox-watch -f
```

### Windows — Task Scheduler

PowerShell (once, as your user):

```powershell
$node   = (Get-Command node).Source
$engine = "$HOME\.local\brain-engine"
$action  = New-ScheduledTaskAction -Execute $node `
  -Argument "`"$engine\tools\inbox-watch\inbox-watch.mjs`" --brain `"$HOME\.brain\brain`" --engine `"$engine`" --drop `"$HOME\Brain-Inbox`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "Brain inbox-watch" -Action $action -Trigger $trigger
```

Set `GH_TOKEN` as a user environment variable so the task sees it:

```powershell
[Environment]::SetEnvironmentVariable("GH_TOKEN", "ghp_your_token_here", "User")
```

> Prefer not to run a resident process? Schedule `--once` on an interval instead (cron /
> `OnIdle` trigger): same script, batch mode.

## One watcher per Brain

The drop-folder is **per-Brain**: each Brain clone you feed needs its own watcher instance, its
own `--drop <folder>`, and its own `--brain <clone-dir>`. A single process watches exactly one
clone and moves files into it — there is no "multi-brain" mode.

**Auto-discovery only works with a single clone.** When `--brain` is omitted and there is
exactly one clone under `~/.brain`, the watcher uses it automatically. As soon as you add a second
clone, it errors:

```
several clones under /Users/YOU/.brain (muzg-knowledge, hooper-brain) — pick one with --brain
```

So with N brains you must run N service units, each with distinct `--drop` / `--brain` / service
name values.

**Example: two brains on macOS (launchd)**

`~/Library/LaunchAgents/com.brain.inbox-watch.muzg-knowledge.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.brain.inbox-watch.muzg-knowledge</string>
  <key>ProgramArguments</key><array>
    <string>/usr/local/bin/node</string>
    <string>/Users/YOU/.local/brain-engine/tools/inbox-watch/inbox-watch.mjs</string>
    <string>--brain</string><string>/Users/YOU/.brain/muzg-knowledge</string>
    <string>--engine</string><string>/Users/YOU/.local/brain-engine</string>
    <string>--drop</string><string>/Users/YOU/Drop-personal</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>GH_TOKEN</key><string>ghp_your_token_here</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>/tmp/inbox-watch-muzg.log</string>
</dict></plist>
```

`~/Library/LaunchAgents/com.brain.inbox-watch.hooper-brain.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.brain.inbox-watch.hooper-brain</string>
  <key>ProgramArguments</key><array>
    <string>/usr/local/bin/node</string>
    <string>/Users/YOU/.local/brain-engine/tools/inbox-watch/inbox-watch.mjs</string>
    <string>--brain</string><string>/Users/YOU/.brain/hooper-brain</string>
    <string>--engine</string><string>/Users/YOU/.local/brain-engine</string>
    <string>--drop</string><string>/Users/YOU/Drop-work</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>GH_TOKEN</key><string>ghp_your_token_here</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>/tmp/inbox-watch-hooper.log</string>
</dict></plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.brain.inbox-watch.muzg-knowledge.plist
launchctl load ~/Library/LaunchAgents/com.brain.inbox-watch.hooper-brain.plist
```

Each unit has a unique `Label`, its own `--brain` clone, and its own `--drop` folder. On Linux,
give each `systemd` unit a distinct filename (e.g. `inbox-watch-muzg.service`,
`inbox-watch-hooper.service`) and set the same two flags in `ExecStart`.

**Service environments and the engine plugin.** Service managers (launchd, systemd) do not run
your shell profile, so the normalizer plugin may not be on PATH. The service examples above already
include `--engine ~/.local/brain-engine` (or `--engine %h/.local/brain-engine` / `$engine` on the
respective platform), which points the script at the engine's `tools/normalizer/normalize-drops.mjs`
without relying on PATH. If you use a different engine path, update that argument (or set
`$BRAIN_ENGINE`) accordingly — Brain clones under `~/.brain/` do not contain a `tools/` directory.
