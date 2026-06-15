/**
 * Poller.gs — Brain meeting-capture START path (milestone m5, front half).
 *
 * A Google Apps Script time-trigger that polls the organizer's "Meet Recordings" Drive folder for
 * NEW Gemini meeting-transcript Google Docs, exports each as Markdown, and POSTs it to the n8n flow
 * (integrations/n8n) which writes _inbox/meet-<ts>.md to the Brain repo. That push fires m3's Action.
 *
 *   Drive "Meet Recordings"  →  [this script]  →  POST  →  n8n  →  GitHub Contents API  →  _inbox/meet-*.md
 *
 * START path = POLLING (deliberate; see EVENT-DRIVEN-TARGET.md for the Pub/Sub evolution that replaces
 * only this front half). Config lives in Script Properties, never hardcoded — see README "Setup".
 *
 * Dedup: every Doc that is successfully POSTed is recorded by file id in Script Properties, so a
 * transcript is sent exactly once across polls. `captured` is the meeting instant (the Doc's created
 * time), NOT the poll time.
 */

// ── Script Property keys (set via setup, see README) ─────────────────────────
var PROP = {
  FOLDER_ID: 'MEET_RECORDINGS_FOLDER_ID',   // the "Meet Recordings" Drive folder id
  N8N_URL: 'N8N_WEBHOOK_URL',                // https://<service>.up.railway.app/webhook/meet-transcript
  N8N_SECRET: 'N8N_WEBHOOK_SECRET',          // shared secret (== n8n's N8N_WEBHOOK_SECRET)
  LOOKBACK_MIN: 'LOOKBACK_MINUTES',          // optional; only consider Docs modified within N min (default 1440)
  PROCESSED_PREFIX: 'done:'                   // per-file dedup marker prefix
};

/**
 * Entry point — wire this to a time-driven trigger (see installTrigger()).
 * Idempotent and safe to run on any cadence; only NEW transcripts are POSTed.
 */
function pollMeetRecordings() {
  var props = PropertiesService.getScriptProperties();
  var cfg = getConfig_(props);

  var folder = DriveApp.getFolderById(cfg.folderId);
  var cutoffMs = Date.now() - cfg.lookbackMin * 60 * 1000;

  // Only Google Docs (Gemini transcripts are Docs). Iterate newest-relevant.
  var it = folder.getFilesByType(MimeType.GOOGLE_DOCS);
  var sent = 0, skipped = 0, failed = 0;

  while (it.hasNext()) {
    var file = it.next();
    var id = file.getId();

    // Skip already-processed (dedup) and anything older than the lookback window.
    if (props.getProperty(PROP.PROCESSED_PREFIX + id)) { skipped++; continue; }
    if (file.getDateCreated().getTime() < cutoffMs && file.getLastUpdated().getTime() < cutoffMs) { skipped++; continue; }

    // A transcript Doc may still be "growing" while Gemini writes it — only take ones that look
    // settled (not updated in the last ~3 min) so we don't capture a half-written transcript.
    if (Date.now() - file.getLastUpdated().getTime() < 3 * 60 * 1000) { skipped++; continue; }

    try {
      var payload = buildPayload_(file, cfg);
      // A transcript with no real content is not worth sending — let it be retried next poll.
      if (!payload.transcript || payload.transcript.trim().length < 20) { skipped++; continue; }

      postToN8n_(payload, cfg);
      // Mark processed only AFTER a successful POST (so a transient failure retries next poll).
      props.setProperty(PROP.PROCESSED_PREFIX + id, new Date().toISOString());
      sent++;
    } catch (e) {
      failed++;
      Logger.log('meet-poller: FAILED on "' + file.getName() + '" (' + id + '): ' + e);
      // Do NOT mark processed — it retries on the next poll.
    }
  }

  Logger.log('meet-poller: sent=' + sent + ' skipped=' + skipped + ' failed=' + failed);
  return { sent: sent, skipped: skipped, failed: failed };
}

/** Read + validate config from Script Properties. Throws a clear error if a required key is missing. */
function getConfig_(props) {
  var folderId = props.getProperty(PROP.FOLDER_ID);
  var n8nUrl = props.getProperty(PROP.N8N_URL);
  var secret = props.getProperty(PROP.N8N_SECRET);
  var missing = [];
  if (!folderId) missing.push(PROP.FOLDER_ID);
  if (!n8nUrl) missing.push(PROP.N8N_URL);
  if (!secret) missing.push(PROP.N8N_SECRET);
  if (missing.length) {
    throw new Error('meet-poller: missing Script Properties: ' + missing.join(', ') + ' — run setup (see README).');
  }
  var lookback = parseInt(props.getProperty(PROP.LOOKBACK_MIN) || '1440', 10);
  return { folderId: folderId, n8nUrl: n8nUrl, secret: secret, lookbackMin: isNaN(lookback) ? 1440 : lookback };
}

/**
 * Build the POST payload from a transcript Doc:
 *   - transcript: the Doc exported as Markdown (verbatim — n8n does NOT pre-distil)
 *   - captured:   the meeting instant (Doc created time, ISO-8601 UTC)
 *   - title:      the Doc name, lightly cleaned (the classifier's strongest hint)
 *   - participants/file/tags: best-effort, included only when truthfully fillable (m2 rule)
 */
function buildPayload_(file, cfg) {
  var transcript = exportDocAsMarkdown_(file.getId());
  var captured = file.getDateCreated().toISOString();   // meeting instant, not poll time

  var rawName = file.getName();
  // Gemini names transcripts like "Pricing review - 2026/06/09 14:00 GMT - Transcript".
  // Strip a trailing " - Transcript"/" Notes by Gemini" decoration for a cleaner title; keep the topic.
  var title = rawName
    .replace(/\s*-\s*(Transcript|Notes by Gemini|Meeting records)\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  var participants = extractParticipants_(transcript);
  var tags = [];   // left empty deliberately — a wrong tag misleads the classifier; m2 says omit if unsure

  var payload = {
    secret: cfg.secret,
    transcript: transcript,
    captured: captured,
    title: title || ('Meeting transcript (' + captured + ')'),
    file: rawName,            // traceability back to the Drive Doc
  };
  if (participants.length) payload.participants = participants;
  if (tags.length) payload.tags = tags;
  return payload;
}

/**
 * Export a Google Doc as Markdown via the Drive export endpoint.
 * Docs Editors support `text/markdown` export (rolled out 2024); we request it and fall back to
 * `text/plain` if a given account/Doc rejects markdown, so the poller is robust either way.
 */
function exportDocAsMarkdown_(fileId) {
  var token = ScriptApp.getOAuthToken();
  var tryExport = function (mime) {
    var url = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) +
      '/export?mimeType=' + encodeURIComponent(mime);
    var res = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });
    return { code: res.getResponseCode(), text: res.getContentText() };
  };

  var md = tryExport('text/markdown');
  if (md.code === 200 && md.text) return md.text;

  var txt = tryExport('text/plain');
  if (txt.code === 200 && txt.text) return txt.text;

  throw new Error('export failed (markdown=' + md.code + ', plain=' + txt.code + ') for file ' + fileId);
}

/**
 * Best-effort participant extraction from a transcript. Gemini transcripts are line-prefixed with the
 * speaker ("[14:00:12] Alice: ..." or "Alice: ..."). Collect distinct speaker labels. Returns [] when
 * nothing reliable is found — an empty list is honest; a fabricated one misleads the classifier (m2 rule).
 */
function extractParticipants_(transcript) {
  var seen = {};
  var order = [];
  var lines = transcript.split('\n');
  for (var i = 0; i < lines.length; i++) {
    // Optional [HH:MM(:SS)] timestamp, then "Name: ". Name = up to ~40 chars, no leading markdown.
    var m = lines[i].match(/^\s*(?:\[\d{1,2}:\d{2}(?::\d{2})?\]\s*)?([A-Z][\w .'()\-]{1,39}?):\s/);
    if (m) {
      var name = m[1].trim();
      // Filter obvious non-speaker labels.
      if (/^(Transcript|Notes|Summary|Action items|Attendees|Recording)$/i.test(name)) continue;
      if (!seen[name]) { seen[name] = true; order.push(name); }
    }
    if (order.length >= 25) break;   // guard against a pathological transcript
  }
  return order;
}

/** POST the payload to n8n. Throws on a non-2xx so the caller leaves the Doc unprocessed for retry. */
function postToN8n_(payload, cfg) {
  var res = UrlFetchApp.fetch(cfg.n8nUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('n8n POST returned ' + code + ': ' + res.getContentText().slice(0, 300));
  }
}
