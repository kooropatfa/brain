#!/usr/bin/env node
// notify-slack.mjs — pings the review channel when new knowledge awaits approval. The outbound
// counterpart of integrations/slack (which feeds Slack INTO the Brain): whenever an `Ingest:` PR
// is open, the steward's Slack channel gets one message; whenever such a PR carries the
// `needs-human` label (the agent has questions / the reviewer escalated), it gets an escalation
// message quoting the questions.
//
// Design: a stateless SCAN, not an event handler. PRs opened by GITHUB_TOKEN never fire
// pull_request workflows (GitHub loop-prevention — the exact problem review-ingest.yml documents),
// so instead of trusting one event we list ALL open `Ingest:` PRs on every trigger and notify the
// ones not yet notified. Dedup state lives on the PR itself as marker labels:
//
//   slack-notified              this PR's "awaits approval" message was sent
//   slack-notified-escalation   this PR's needs-human escalation was sent
//
// Idempotent and self-healing: double triggers are harmless, missed triggers are caught by the
// next one. A notification must never fail the pipeline — every error logs and exits 0.
//
// Env:  SLACK_WEBHOOK_URL  incoming webhook bound to the review channel (absent = silent no-op)
//       GITHUB_TOKEN       repo-scoped token for listing PRs + adding marker labels
//       GITHUB_REPOSITORY  owner/name (set by Actions)
//
// Pure Node 20+ (global fetch), zero deps.

const log = (m) => console.error("notify-slack: " + m);
const ok = (m) => { if (m) log(m); process.exit(0); };

const WEBHOOK = process.env.SLACK_WEBHOOK_URL;
const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY;
if (!WEBHOOK) ok("SLACK_WEBHOOK_URL not set — notifications are off, nothing to do");
if (!TOKEN || !REPO) ok("GITHUB_TOKEN / GITHUB_REPOSITORY missing — not running inside Actions?");

const NOTIFIED = "slack-notified";
const ESCALATED = "slack-notified-escalation";

async function gh(pathname, init = {}) {
  const res = await fetch(`https://api.github.com${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "brain-notifier",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method || "GET"} ${pathname} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function slack(blocks, fallback) {
  const res = await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: fallback, blocks }),
  });
  if (!res.ok) throw new Error(`Slack webhook → ${res.status} ${await res.text()}`);
}

// Pull the '## Agent questions' section out of a PR body (the ingest classifier writes one when
// the normalizer flagged unclear drops).
function agentQuestions(body) {
  const m = (body || "").match(/##\s*Agent questions\s*\r?\n([\s\S]*?)(?=\r?\n##\s|$)/i);
  return m ? m[1].trim() : null;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

try {
  const prs = (await gh(`/repos/${REPO}/pulls?state=open&per_page=100`))
    .filter((pr) => pr.title.startsWith("Ingest:"));
  if (!prs.length) ok("no open Ingest: PRs — nothing to notify");

  for (const pr of prs) {
    const labels = new Set(pr.labels.map((l) => l.name));
    const title = esc(pr.title.replace(/^Ingest:\s*/, ""));
    const link = `<${pr.html_url}|${title}>`;

    if (!labels.has(NOTIFIED)) {
      const ctx = [`PR #${pr.number}`, pr.draft ? "draft — the agent flagged a judgment call" : "ready for review"];
      await slack(
        [
          { type: "section", text: { type: "mrkdwn", text: `:brain: *New knowledge awaits approval*\n${link}` } },
          { type: "context", elements: [{ type: "mrkdwn", text: ctx.join("  ·  ") }] },
        ],
        `New knowledge awaits approval: ${pr.title} ${pr.html_url}`
      );
      await gh(`/repos/${REPO}/issues/${pr.number}/labels`, { method: "POST", body: JSON.stringify({ labels: [NOTIFIED] }) });
      log(`notified: PR #${pr.number} (${pr.title})`);
    }

    if (labels.has("needs-human") && !labels.has(ESCALATED)) {
      const q = agentQuestions(pr.body);
      const detail = q
        ? `*The agent asks:*\n${esc(q).split("\n").map((l) => "> " + l).join("\n")}`
        : "_See the review comments on the PR for what needs a decision._";
      await slack(
        [
          { type: "section", text: { type: "mrkdwn", text: `:warning: *Knowledge needs a human decision*\n${link}\n${detail}` } },
          { type: "context", elements: [{ type: "mrkdwn", text: `PR #${pr.number}  ·  label: needs-human` }] },
        ],
        `Knowledge needs a human decision: ${pr.title} ${pr.html_url}`
      );
      await gh(`/repos/${REPO}/issues/${pr.number}/labels`, { method: "POST", body: JSON.stringify({ labels: [ESCALATED] }) });
      log(`escalated: PR #${pr.number} (${pr.title})`);
    }
  }
} catch (e) {
  ok("failed (notification must never fail the pipeline): " + e.message);
}
ok();
