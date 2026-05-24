// eslint-disable-next-line @typescript-eslint/no-var-requires
const { reconcileCredentials } = require('../../scripts/lib/admin-credentials-reconcile.cjs');

// ─────────────────────────────────────────────────────────────────────────────
// Pure verdict for the credentials-truth reconciliation in
// grant-platform-admin.sh. The shell path is hard to unit-test directly, so
// we lock the rules here and the shell mirrors them. Each branch corresponds
// to a real operator-facing failure mode the user reported, plus the safe
// happy paths.
// ─────────────────────────────────────────────────────────────────────────────

describe('reconcileCredentials — happy paths', () => {
  it('keeps the new credentials when the DB accepted our hash', () => {
    const v = reconcileCredentials({
      passwordWasGenerated: true,
      hashApplied: true,
      hasPreviousFile: false,
      adminEmail: 'admin@example.com',
    });
    expect(v).toMatchObject({ action: 'keep', reason: 'hash_applied', dropBackup: true });
  });

  it('keeps the new credentials and drops the backup when previous existed', () => {
    const v = reconcileCredentials({
      passwordWasGenerated: true,
      hashApplied: true,
      hasPreviousFile: true,
      adminEmail: 'admin@example.com',
    });
    expect(v.action).toBe('keep');
    expect(v.dropBackup).toBe(true);
  });

  it('does not touch credentials when the caller supplied the hash explicitly', () => {
    // If the operator passed ADMIN_BOOTSTRAP_PASSWORD_HASH directly, they
    // own the matching credential storage. We must not delete or alter it
    // even if the DB refused to reset the hash.
    const v = reconcileCredentials({
      passwordWasGenerated: false,
      hashApplied: false,
      hasPreviousFile: true,
      adminEmail: 'admin@example.com',
    });
    expect(v).toMatchObject({ action: 'keep', reason: 'no_password_was_generated' });
  });
});

describe('reconcileCredentials — the bug the user reported', () => {
  it('restores the previous credentials file when DB kept the old hash and a backup exists', () => {
    // This is the second-run scenario: hash-admin-password.mjs wrote a new
    // credentials file pointing at password P2, but the SQL ON DUPLICATE KEY
    // UPDATE kept the existing password_hash because reset=false. The new
    // file would mislead the operator. The previous credentials file (P1)
    // still matches the DB row, so we put it back.
    const v = reconcileCredentials({
      passwordWasGenerated: true,
      hashApplied: false,
      hasPreviousFile: true,
      adminEmail: 'admin@example.com',
    });
    expect(v.action).toBe('restore_previous');
    expect(v.reason).toBe('hash_not_applied_previous_restored');
    expect(v.marker).toContain('REPLACED with the previous credentials file');
    expect(v.marker).toContain('ADMIN_RESET_PASSWORD_HASH=true');
    expect(v.marker).toContain('admin@example.com');
  });

  it('deletes the new credentials file when DB kept the old hash and no backup is available', () => {
    // Edge case: the user manually deleted .previous before re-running, or
    // the backup step failed silently. Either way, leaving the misleading
    // new file in place is worse than leaving none — the operator will at
    // least know they need to recover the password some other way.
    const v = reconcileCredentials({
      passwordWasGenerated: true,
      hashApplied: false,
      hasPreviousFile: false,
      adminEmail: 'admin@example.com',
    });
    expect(v.action).toBe('delete_new');
    expect(v.reason).toBe('hash_not_applied_no_previous');
    expect(v.marker).toContain('DELETED');
    expect(v.marker).toContain('ADMIN_RESET_PASSWORD_HASH=true');
  });

  it('marker text guides the operator to the safe remediation step', () => {
    const v = reconcileCredentials({
      passwordWasGenerated: true,
      hashApplied: false,
      hasPreviousFile: false,
      adminEmail: 'admin@example.com',
    });
    // The marker is the only artefact left on disk for the next operator.
    // It must say WHY the file is gone and HOW to fix it. Without these two
    // sentences the bug repeats: someone re-runs the script and gets locked
    // out again.
    expect(v.marker).toMatch(/database kept the existing password_hash/i);
    expect(v.marker).toMatch(/ADMIN_RESET_PASSWORD_HASH=true/);
  });
});

describe('reconcileCredentials — defensive defaults', () => {
  it('keeps credentials when hashApplied is unknown (e.g. SQL output not parseable)', () => {
    // Older SQL releases or a parsing failure → we cannot prove the file
    // is wrong. Default to keeping it so we do not destroy potentially
    // valid credentials based on a bug in our own parser.
    const v = reconcileCredentials({
      passwordWasGenerated: true,
      hashApplied: undefined,
      hasPreviousFile: true,
      adminEmail: 'admin@example.com',
    });
    expect(v.action).toBe('keep');
    expect(v.reason).toBe('hash_applied_unknown');
  });

  it('does not include sensitive password material in the marker', () => {
    // The marker is plain-text and may end up in logs / git. It must not
    // echo the password we just wrote.
    const v = reconcileCredentials({
      passwordWasGenerated: true,
      hashApplied: false,
      hasPreviousFile: true,
      adminEmail: 'admin@example.com',
    });
    expect(v.marker).not.toMatch(/password=/i);
    expect(v.marker).not.toMatch(/[A-Za-z0-9_-]{32,}/); // any long token-shaped run
  });
});
