import { createHash } from 'node:crypto';

export type Artifact = { id: string; sha256: string; metadata?: Record<string, unknown> };

export class ArtifactRegistry {
  private artifacts = new Map<string, string>();
  constructor(private readonly opts?: { strict?: boolean }) {}

  registerArtifact(id: string, sha256: string) {
    this.artifacts.set(id, sha256);
  }

  verifyArtifact(id: string, sha256: string) {
    const expected = this.artifacts.get(id);
    if (!expected) throw new Error(`Artifact ${id} not registered`);
    if (expected !== sha256) {
      if (this.opts?.strict ?? true) {
        throw new Error(`Fail-close: artifact ${id} hash mismatch`);
      }
      return false;
    }
    return true;
  }

  listArtifacts() {
    return Array.from(this.artifacts.entries()).map(([id, sha]) => ({ id, sha }));
  }
}

/** Raw byte/string SHA-256 (distinct from JSON-canonical hashValue). */
export function computeSha256(input: string | Buffer): string {
  const hash = createHash('sha256');
  hash.update(input);
  return hash.digest('hex');
}

/** @deprecated Use ArtifactRegistry — kept for GuardFlow / manifest compat */
export class FailCloseHarness extends ArtifactRegistry {}
