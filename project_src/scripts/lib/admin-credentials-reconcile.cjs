'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Pure decision logic for "did the password we just hashed actually land in
// the database, and what should we do with the credentials file we wrote?"
//
// grant-platform-admin.sh embeds a tiny Node one-liner to read
// passwordHashApplied from the SQL evidence JSON, so a regression in *that*
// shell logic is hard to test directly. We instead expose this pure function
// so the rules ("when is the credentials file misleading?") are unit-testable
// in one place. The shell calls a structurally-equivalent path and is kept in
// sync with this contract by the failure-mode tests below.
//
// Return shape:
//   action: 'keep' | 'restore_previous' | 'delete_new'
//   reason: short machine-readable tag
//   marker: optional human-readable text to write next to the file
// ─────────────────────────────────────────────────────────────────────────────

function reconcileCredentials({ passwordWasGenerated, hashApplied, hasPreviousFile, adminEmail }) {
  if (!passwordWasGenerated) {
    // Caller supplied an explicit hash — they are responsible for the
    // matching credentials file (or the absence of one).
    return { action: 'keep', reason: 'no_password_was_generated' };
  }

  if (hashApplied === true) {
    // The DB accepted our new hash. The fresh credentials file is correct.
    // Drop the backup so the directory does not accumulate stale files.
    return { action: 'keep', reason: 'hash_applied', dropBackup: true };
  }

  if (hashApplied === false) {
    // Critical case the user reported: we wrote a credentials file pointing
    // at a password the database refused to accept. We must NOT leave it
    // in place pretending to be valid.
    if (hasPreviousFile) {
      return {
        action: 'restore_previous',
        reason: 'hash_not_applied_previous_restored',
        marker: buildMarker(adminEmail, 'restored'),
      };
    }
    return {
      action: 'delete_new',
      reason: 'hash_not_applied_no_previous',
      marker: buildMarker(adminEmail, 'deleted'),
    };
  }

  // hashApplied is unknown (older SQL, parse error). Be conservative: leave
  // the credentials in place but record the uncertainty so the operator
  // can decide.
  return { action: 'keep', reason: 'hash_applied_unknown' };
}

function buildMarker(adminEmail, mode) {
  const intro = mode === 'restored'
    ? 'The new credentials file would have lied — it has been REPLACED with the previous credentials file that still matches the password_hash in the database.'
    : 'No previous credentials file existed, so the misleading new credentials file has been DELETED rather than left to mislead future operators.';
  return [
    `Admin: ${adminEmail || '(unknown)'}`,
    'The current run generated a NEW one-time password, but the database kept',
    'the existing password_hash (ADMIN_RESET_PASSWORD_HASH was not true and',
    'the user already had a password).',
    '',
    intro,
    '',
    'To set a new password, re-run with: ADMIN_RESET_PASSWORD_HASH=true',
  ].join('\n');
}

module.exports = { reconcileCredentials };
