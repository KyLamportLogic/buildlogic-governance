import { createHash } from 'node:crypto';

export interface ContentFingerprint {
  algorithm: 'sha256';
  digest: string;
  byteLength: number;
  createdAt: string;
}

export function fingerprintContent(content: string | Buffer): ContentFingerprint {
  const buffer = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  const digest = createHash('sha256').update(buffer).digest('hex');
  return {
    algorithm: 'sha256',
    digest,
    byteLength: buffer.length,
    createdAt: new Date().toISOString(),
  };
}

export function verifyContentFingerprint(content: string | Buffer, expectedDigest: string): boolean {
  return fingerprintContent(content).digest === expectedDigest;
}
