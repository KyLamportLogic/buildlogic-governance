/**
 * Optional AWS S3 Object Lock (WORM) audit append via official AWS SDK.
 * Activate with AGENTIC_WORM_S3_BUCKET + AWS credentials.
 */

import type { WormAppendInput, WormAppendResult } from "./types";

function isWormRequired(): boolean {
  return String(process.env.AGENTIC_WORM_REQUIRED ?? "").toLowerCase() === "true";
}

/**
 * Append an immutable audit object. Uses @aws-sdk/client-s3 when installed.
 */
export async function appendWormAudit(
  input: WormAppendInput
): Promise<WormAppendResult> {
  const bucket =
    input.bucket || process.env.AGENTIC_WORM_S3_BUCKET?.trim() || "";
  if (!bucket) {
    if (isWormRequired()) {
      return {
        ok: false,
        skipped: false,
        reason:
          "AGENTIC_WORM_REQUIRED=true but AGENTIC_WORM_S3_BUCKET missing — fail-close",
      };
    }
    return {
      ok: true,
      skipped: true,
      reason:
        "WORM S3 skipped — set AGENTIC_WORM_S3_BUCKET + Object Lock Compliance Mode for production",
    };
  }

  try {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({});
    const retentionDays = input.retentionDays ?? 90;
    const retainUntil = new Date(
      Date.now() + retentionDays * 24 * 60 * 60 * 1000
    );

    const out = await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: input.key,
        Body: input.body,
        ObjectLockMode: "COMPLIANCE",
        ObjectLockRetainUntilDate: retainUntil,
        ContentType: "application/json",
      })
    );

    return {
      ok: true,
      skipped: false,
      reason: "WORM object written (S3 Object Lock Compliance)",
      etag: out.ETag,
      versionId: out.VersionId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      /Cannot find module|ERR_MODULE_NOT_FOUND/i.test(message) ||
      (err as NodeJS.ErrnoException)?.code === "MODULE_NOT_FOUND"
    ) {
      return {
        ok: !isWormRequired(),
        skipped: true,
        reason:
          "@aws-sdk/client-s3 not installed — optional peer; install to enable WORM",
      };
    }
    return {
      ok: false,
      skipped: false,
      reason: `WORM S3 append failed (fail-close): ${message}`,
    };
  }
}
