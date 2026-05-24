#!/usr/bin/env node
/**
 * Streaming sha256 + byte-count probe.
 *
 * Used by mysql-backup.sh in BACKUP_STREAM_DIRECT=true mode:
 *
 *   mysqldump | gzip | node stream-backup-checksum.mjs \
 *     --hash-out /tmp/sha --bytes-out /tmp/bytes \
 *   | rclone rcat s3:bucket/dump.sql.gz
 *
 * Reads stdin, writes the bytes verbatim to stdout (so rclone uploads them),
 * and updates a sha256 hasher + a byte counter as data flows through. On
 * stdin EOF, writes the final values to the two output files. The bash
 * wrapper reads them after the pipeline returns to populate the heartbeat
 * and the .sha256 sidecar uploaded next to the dump.
 *
 * Why a Node helper rather than `tee >(sha256sum) >(wc -c)`?
 *   - Bash process-substitution races: the parent shell can read the
 *     sidecar files before the substituted processes flush, producing
 *     empty/partial values intermittently.
 *   - tee waits for its consumers to drain on EACH chunk, so a stalled
 *     rclone upload back-pressures sha256sum the same way it would
 *     back-pressure rcat — predictable behaviour, no buffering surprises.
 *   - The same logic is unit-tested via scripts/lib/stream-checksum.cjs.
 *
 * Failure modes:
 *   - stdin error: exit 1 (mysqldump or gzip died).
 *   - stdout error (EPIPE): exit 1 (rclone died — the dump is not on the
 *     remote, do not write sidecar files claiming success).
 *   - missing --hash-out / --bytes-out: exit 64 (caller bug).
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

function readArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx === process.argv.length - 1) return null;
  return process.argv[idx + 1];
}

const hashOut = readArg('--hash-out');
const bytesOut = readArg('--bytes-out');

if (!hashOut || !bytesOut) {
  process.stderr.write('stream-backup-checksum: --hash-out and --bytes-out are required\n');
  process.exit(64);
}

const hash = createHash('sha256');
let total = 0;
let stdoutClosed = false;

process.stdin.on('data', (chunk) => {
  hash.update(chunk);
  total += chunk.length;
  // Apply backpressure: if the downstream (rclone) is slow, pause stdin
  // until it drains. Without this we would buffer the whole dump in node
  // memory — exactly the disk-full failure mode this feature avoids.
  const ok = process.stdout.write(chunk);
  if (!ok) {
    process.stdin.pause();
    process.stdout.once('drain', () => process.stdin.resume());
  }
});

process.stdin.on('end', () => {
  // Only after stdin closes do we trust the totals. Write atomically by
  // writing the whole file in one syscall — these are tiny (<100 bytes).
  try {
    writeFileSync(hashOut, hash.digest('hex') + '\n', { mode: 0o600 });
    writeFileSync(bytesOut, String(total) + '\n', { mode: 0o600 });
  } catch (error) {
    process.stderr.write(`stream-backup-checksum: failed to write sidecar files: ${error.message}\n`);
    process.exit(1);
  }
  process.stdout.end();
});

process.stdin.on('error', (err) => {
  process.stderr.write(`stream-backup-checksum: stdin error: ${err.message}\n`);
  process.exit(1);
});

process.stdout.on('error', (err) => {
  // Do NOT write the sidecar files — rclone failed and the remote does
  // not have a dump. Pretending it does would corrupt the heartbeat.
  if (!stdoutClosed) {
    stdoutClosed = true;
    process.stderr.write(`stream-backup-checksum: stdout error: ${err.message}\n`);
    process.exit(1);
  }
});
