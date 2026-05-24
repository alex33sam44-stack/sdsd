'use strict';

const { createHash } = require('node:crypto');

// ─────────────────────────────────────────────────────────────────────────────
// Pure summarizer for "stream a backup through, compute sha256+bytes as it
// passes". Lives in CommonJS so the streaming CLI (.mjs that runs on the
// VPS) and the Jest tests (ts-jest, no transforms) can both consume it
// without any build step.
//
// The CLI path uses Node's streams API; this function is the
// reduction-equivalent we use in tests, where input is a finite array of
// chunks. Identical sha256 / byte-count semantics.
// ─────────────────────────────────────────────────────────────────────────────

function summarize(chunks) {
  if (!Array.isArray(chunks)) {
    throw new TypeError('summarize expects an array of chunks');
  }
  const hash = createHash('sha256');
  let bytes = 0;
  for (const chunk of chunks) {
    if (chunk == null) continue;
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    hash.update(buf);
    bytes += buf.length;
  }
  return { sha256: hash.digest('hex'), bytes };
}

// formatSidecar produces the two-field "<sha256>  <name>\n" line matching
// the output of `sha256sum <name>` so verifiers using the standard tool
// keep working. The remote file ends up next to the dump itself
// (e.g. dump.sql.gz + dump.sql.gz.sha256).
function formatSidecar({ sha256, name }) {
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(sha256)) {
    throw new TypeError('formatSidecar: sha256 must be 64 hex chars');
  }
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError('formatSidecar: name must be a non-empty string');
  }
  return `${sha256.toLowerCase()}  ${name}\n`;
}

module.exports = { summarize, formatSidecar };
