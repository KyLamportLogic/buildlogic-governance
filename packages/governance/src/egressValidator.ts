/**
 * AI Governance Toll Booth — Egress Validator
 *
 * HUMAN: Blocks calls to private IPs, localhost, and cloud metadata endpoints.
 * AI_CANONICAL:preflight.egress.mode=deferred_to_validateEgressUrl
 *   — this module is the SSRF check; runGovernancePreflight does not call it.
 *
 * Defense model (app layer):
 *   1. Canonicalize host → IP (decimal / IPv6-mapped / dotted) before matching
 *   2. CIDR membership via node:net.BlockList (RFC1918 + link-local + loopback + ULA)
 *   3. DNS resolve then CIDR-check all answers (fail-close on DNS failure)
 *
 * Redirects: callers must refuse follows (maxRedirects: 0) or re-validate Location.
 */

import dns from "node:dns";
import net from "node:net";
import type { EgressValidationResult } from "./types";

/** Shared CIDR blocklist — ranges, not hostname string literals. */
const PRIVATE_BLOCK_LIST = (() => {
  const bl = new net.BlockList();
  bl.addSubnet("0.0.0.0", 8, "ipv4"); // "this" network
  bl.addSubnet("10.0.0.0", 8, "ipv4");
  bl.addSubnet("127.0.0.0", 8, "ipv4");
  bl.addSubnet("169.254.0.0", 16, "ipv4");
  bl.addSubnet("172.16.0.0", 12, "ipv4");
  bl.addSubnet("192.168.0.0", 16, "ipv4");
  bl.addSubnet("::1", 128, "ipv6");
  bl.addSubnet("fc00::", 7, "ipv6"); // ULA
  bl.addSubnet("fe80::", 10, "ipv6"); // link-local
  return bl;
})();

function stripBrackets(host: string): string {
  return host.replace(/^\[|\]$/g, "");
}

/**
 * Unwrap IPv4-mapped IPv6 (::ffff:a.b.c.d or ::ffff:aabb:ccdd) to dotted IPv4.
 */
export function unwrapIpv4Mapped(ip: string): string | null {
  const clean = stripBrackets(ip).toLowerCase();
  if (!clean.startsWith("::ffff:")) return null;
  const rest = clean.slice("::ffff:".length);
  if (net.isIPv4(rest)) return rest;
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(rest);
  if (!hex) return null;
  const hi = parseInt(hex[1], 16);
  const lo = parseInt(hex[2], 16);
  if (Number.isNaN(hi) || Number.isNaN(lo)) return null;
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
}

/**
 * Decode decimal IPv4 (e.g. 2130706433 → 127.0.0.1).
 */
function decodeDecimalIpv4(host: string): string | null {
  if (!/^\d+$/.test(host)) return null;
  // Avoid precision loss above 2^53; IPv4 max is 2^32-1
  if (host.length > 10) return null;
  const n = Number(host);
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) return null;
  return [
    (n >>> 24) & 255,
    (n >>> 16) & 255,
    (n >>> 8) & 255,
    n & 255,
  ].join(".");
}

/**
 * Canonicalize a hostname or IP literal to a dotted/colon IP string when possible.
 * Returns null for ordinary DNS names (caller should resolve via DNS).
 */
export function canonicalizeHostToIp(hostname: string): string | null {
  const host = stripBrackets(hostname.trim().toLowerCase());
  if (!host) return null;

  const mapped = unwrapIpv4Mapped(host);
  if (mapped) return mapped;

  if (net.isIP(host)) return host;

  const decimal = decodeDecimalIpv4(host);
  if (decimal) return decimal;

  return null;
}

/**
 * Check if an IP address is private, local, or reserved via CIDR membership.
 * Covers:
 * - Loopback: 127.0.0.0/8, ::1
 * - Private RFC1918: 10/8, 172.16/12, 192.168/16
 * - Link-local: 169.254.0.0/16, fe80::/10
 * - ULA: fc00::/7
 * - IPv4-mapped IPv6 forms (unwrapped then checked)
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  if (!ip) return true;

  const mapped = unwrapIpv4Mapped(ip);
  const candidate = mapped ?? stripBrackets(ip);

  const family = net.isIP(candidate);
  if (!family) return true; // Fail-close: unknown format is private

  return PRIVATE_BLOCK_LIST.check(
    candidate,
    family === 6 ? "ipv6" : "ipv4"
  );
}

/**
 * HTTPS is required unless an operator explicitly opts out.
 * `AI_EGRESS_REQUIRE_HTTPS=false` allows plain http to otherwise-public hosts.
 */
export function isHttpsRequired(): boolean {
  return process.env.AI_EGRESS_REQUIRE_HTTPS !== "false";
}

/**
 * Validate that a URL is safe for outbound calls (not SSRF).
 *
 * Checks:
 * 1. Protocol is http/https only
 * 2. No embedded credentials
 * 3. Hostname canonicalize → CIDR check when host is an IP literal
 * 4. DNS resolves to public IPs only (fail-close if any private / if DNS fails)
 * 5. Plain HTTP to an otherwise-public host is denied unless
 *    AI_EGRESS_REQUIRE_HTTPS=false (checked after SSRF so private-IP tests keep
 *    their reasons)
 */
export async function validateOutboundUrl(
  url: string
): Promise<EgressValidationResult> {
  try {
    const parsed = new URL(url);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { ok: false, reason: "Only http/https protocols allowed" };
    }

    if (parsed.username || parsed.password) {
      return {
        ok: false,
        reason: "URLs with embedded credentials are not allowed",
      };
    }

    const hostLower = stripBrackets(parsed.hostname.toLowerCase());
    if (hostLower === "localhost") {
      return { ok: false, reason: "Localhost targets are blocked" };
    }

    // Canonicalize IP literals (decimal / mapped / dotted) BEFORE DNS
    const literalIp = canonicalizeHostToIp(hostLower);
    if (literalIp) {
      if (isPrivateOrReservedIp(literalIp)) {
        return {
          ok: false,
          reason: "Private network targets are blocked",
        };
      }
      // Public IP literal — no DNS required
      if (isHttpsRequired() && parsed.protocol !== "https:") {
        return {
          ok: false,
          reason:
            "Plain-HTTP egress is blocked (AI_EGRESS_REQUIRE_HTTPS); use https",
        };
      }
      return { ok: true, checked: true };
    }

    // Look up without brackets (Node hostname may retain [] for IPv6 literals)
    const dnsName = stripBrackets(parsed.hostname);
    try {
      const lookup = await dns.promises.lookup(dnsName, {
        all: true,
      });

      const hasPrivateIp = lookup.some((entry) =>
        isPrivateOrReservedIp(entry.address)
      );
      if (hasPrivateIp) {
        return {
          ok: false,
          reason: "Private network targets are blocked",
        };
      }
    } catch (dnsError) {
      return {
        ok: false,
        reason: `DNS resolution failed for ${dnsName}: ${dnsError instanceof Error ? dnsError.message : String(dnsError)}`,
      };
    }

    if (isHttpsRequired() && parsed.protocol !== "https:") {
      return {
        ok: false,
        reason:
          "Plain-HTTP egress is blocked (AI_EGRESS_REQUIRE_HTTPS); use https",
      };
    }

    return { ok: true, checked: true };
  } catch (error) {
    return {
      ok: false,
      reason: `Invalid URL: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Batch validate multiple URLs in parallel.
 */
export async function validateOutboundUrlsBatch(
  urls: string[]
): Promise<Map<string, EgressValidationResult>> {
  const results = new Map<string, EgressValidationResult>();
  const promises = urls.map(async (url) => ({
    url,
    result: await validateOutboundUrl(url),
  }));

  const validations = await Promise.all(promises);
  for (const { url, result } of validations) {
    results.set(url, result);
  }

  return results;
}
