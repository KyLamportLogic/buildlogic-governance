import { timingSafeEqual } from "node:crypto";

const PLACEHOLDER_ADMIN_TOKENS = new Set([
  "changeme",
  "change-me",
  "change_me",
  "replace-with-long-random-secret",
]);

/**
 * True when the *server-side* configured token is missing or is a known weak
 * default. Single source of truth so the startup guard and the per-call guard
 * can never drift apart.
 */
export function isUnusableAdminToken(configuredToken: string | undefined): boolean {
  const configured = String(configuredToken ?? "").trim();
  return !configured || PLACEHOLDER_ADMIN_TOKENS.has(configured.toLowerCase());
}

/**
 * Authorize an admin action (kill/revive) with fail-closed semantics:
 * - the server-configured token must be present and not a known weak default,
 *   otherwise NO token is accepted (the control is disabled, not open);
 * - comparison is constant-time to avoid a timing side-channel.
 */
export function isAdminAuthorized(
  configuredToken: string | undefined,
  providedToken: string | undefined
): boolean {
  const configured = String(configuredToken ?? "").trim();
  const provided = String(providedToken ?? "");
  if (isUnusableAdminToken(configured)) return false; // unset/placeholder → fail closed
  const a = Buffer.from(configured);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
