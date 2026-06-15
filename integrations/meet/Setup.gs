/**
 * Setup.gs — one-time configuration + trigger management + a no-write dry run.
 * Run these from the Apps Script editor (Run ▸ <function>) after pasting the project. See README.
 */

/**
 * Set all required Script Properties in one call, then install the time trigger.
 * EDIT the values below before running once. Nothing is hardcoded in the poller — it reads these.
 *
 * Get the folder id from the "Meet Recordings" folder's Drive URL:
 *   https://drive.google.com/drive/folders/<THIS_IS_THE_FOLDER_ID>
 */
function setup() {
  var props = PropertiesService.getScriptProperties();
  props.setProperties({
    'MEET_RECORDINGS_FOLDER_ID': 'PASTE_FOLDER_ID_HERE',
    'N8N_WEBHOOK_URL': 'https://YOUR-SERVICE.up.railway.app/webhook/meet-transcript',
    'N8N_WEBHOOK_SECRET': 'PASTE_THE_SAME_SECRET_AS_N8N',
    'LOOKBACK_MINUTES': '1440'
  }, false);
  Logger.log('Properties set. Now run installTrigger() once.');
}

/** Install a time-driven trigger that runs pollMeetRecordings() every N minutes (default 15). */
function installTrigger() {
  removeTriggers();   // idempotent — never stack duplicate triggers
  var everyMinutes = 15;   // 1, 5, 10, 15, or 30 are the values Apps Script allows for minute triggers
  ScriptApp.newTrigger('pollMeetRecordings')
    .timeBased()
    .everyMinutes(everyMinutes)
    .create();
  Logger.log('Trigger installed: pollMeetRecordings every ' + everyMinutes + ' min.');
}

/** Remove all triggers this script owns (use before re-installing or to pause polling). */
function removeTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) ScriptApp.deleteTrigger(triggers[i]);
  Logger.log('Removed ' + triggers.length + ' trigger(s).');
}

/**
 * DRY RUN — exercises discovery + export + payload-building for the most recent transcript Doc, WITHOUT
 * POSTing and WITHOUT marking anything processed. Use this to confirm Drive access + export + the
 * payload shape before going live. Logs the payload (secret redacted) and the filename it would write.
 */
function dryRun() {
  var props = PropertiesService.getScriptProperties();
  var cfg = getConfig_(props);
  var folder = DriveApp.getFolderById(cfg.folderId);
  var it = folder.getFilesByType(MimeType.GOOGLE_DOCS);
  if (!it.hasNext()) { Logger.log('dryRun: no Google Docs in the folder.'); return; }

  // newest by created time
  var newest = null;
  while (it.hasNext()) {
    var f = it.next();
    if (!newest || f.getDateCreated().getTime() > newest.getDateCreated().getTime()) newest = f;
  }

  var payload = buildPayload_(newest, cfg);
  var stamp = isoToStamp_(payload.captured);
  var redacted = JSON.parse(JSON.stringify(payload));
  redacted.secret = '***redacted***';
  redacted.transcript = payload.transcript.slice(0, 400) + (payload.transcript.length > 400 ? '… [truncated]' : '');

  Logger.log('dryRun: would write _inbox/meet-' + stamp + '.md');
  Logger.log('dryRun: payload = ' + JSON.stringify(redacted, null, 2));
  Logger.log('dryRun: participants detected = ' + JSON.stringify(payload.participants || []));
}

/** Mirror of the n8n/normalize.js stamp derivation, for the dry-run preview only. */
function isoToStamp_(iso) {
  var d = new Date(iso);
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) +
    '-' + p(d.getUTCHours()) + p(d.getUTCMinutes());
}

/** Clear the dedup markers (forces every Doc in the window to be re-sent on the next poll). Use sparingly. */
function resetProcessed() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var n = 0;
  for (var k in all) { if (k.indexOf(PROP.PROCESSED_PREFIX) === 0) { props.deleteProperty(k); n++; } }
  Logger.log('Cleared ' + n + ' processed-marker(s).');
}
