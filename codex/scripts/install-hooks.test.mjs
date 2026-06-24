import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "install-hooks.mjs");

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function runInstallHooks({ engineRoot, codexHome }) {
  return spawnSync(process.execPath, [script, "--engine-root", engineRoot], {
    env: { ...process.env, CODEX_HOME: codexHome },
    encoding: "utf8",
  });
}

test("install-hooks preserves hooks.json and does not duplicate Brain SessionStart", () => {
  const engineRoot = tempDir("brain-engine-");
  const codexHome = tempDir("brain-codex-home-");
  const hookDir = path.join(engineRoot, "codex", "hooks");
  fs.mkdirSync(hookDir, { recursive: true });
  fs.writeFileSync(path.join(hookDir, "session-start-sync.mjs"), "#!/usr/bin/env node\n");

  const hooksFile = path.join(codexHome, "hooks.json");
  fs.writeFileSync(
    hooksFile,
    JSON.stringify(
      {
        hooks: {
          PostToolUse: [{ hooks: [{ type: "command", command: "echo keep" }] }],
          SessionStart: [{ hooks: [{ type: "command", command: "echo existing" }] }],
        },
      },
      null,
      2,
    ) + "\n",
  );

  const first = runInstallHooks({ engineRoot, codexHome });
  assert.equal(first.status, 0, first.stderr);
  const second = runInstallHooks({ engineRoot, codexHome });
  assert.equal(second.status, 0, second.stderr);

  const config = JSON.parse(fs.readFileSync(hooksFile, "utf8"));
  assert.deepEqual(config.hooks.PostToolUse, [{ hooks: [{ type: "command", command: "echo keep" }] }]);
  assert.equal(config.hooks.SessionStart.length, 2);

  const brainHooks = config.hooks.SessionStart.filter((entry) =>
    JSON.stringify(entry).includes("codex/hooks/session-start-sync.mjs"),
  );
  assert.equal(brainHooks.length, 1);
});
