#!/usr/bin/env node
const value = process.argv[2] || process.env.STAGING_URL || process.env.API || process.env.BACKEND_URL || process.env.VITE_API_BASE_URL || '';
const label = process.argv[3] || 'URL';
const fakeHostPattern = /(^|\.)((example|yourdomain|localhost)(\.|$)|example\.com$|example\.org$|example\.net$|example\.invalid$|test$|invalid$)/i;
function fail(message) {
  console.error(`[validate-real-url] ${label} rejected: ${message}`);
  process.exit(1);
}
if (!value) fail('missing');
let parsed;
try { parsed = new URL(value); } catch { fail(`not a valid URL: ${value}`); }
if (parsed.protocol !== 'https:') fail('must use https://');
if (fakeHostPattern.test(parsed.hostname)) fail(`placeholder hostname '${parsed.hostname}' is not allowed`);
if (/^(127\.0\.0\.1|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(parsed.hostname)) fail(`private/local hostname '${parsed.hostname}' is not allowed for staging proof`);
console.log(`[validate-real-url] ${label} accepted: ${parsed.origin}${parsed.pathname}`);
