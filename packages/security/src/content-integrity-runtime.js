'use strict';

/**
 * CommonJS ProofSeal fingerprint helpers for @kypython/buildlogic-security.
 * Keep aligned with src/content-integrity.ts.
 */

const { createHash } = require('node:crypto');

function fingerprintContent(content) {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
  return {
    algorithm: 'sha256',
    digest: createHash('sha256').update(buffer).digest('hex'),
    byteLength: buffer.length,
    createdAt: new Date().toISOString(),
  };
}

function verifyContentFingerprint(content, expectedDigest) {
  return fingerprintContent(content).digest === expectedDigest;
}

module.exports = {
  fingerprintContent,
  verifyContentFingerprint,
};
