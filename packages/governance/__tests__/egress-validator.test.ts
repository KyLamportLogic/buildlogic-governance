/*
 * Spec: canonicalize host → IP, then CIDR-check (RFC1918 + link-local + loopback).
 * Encoding tricks (decimal, IPv6-mapped) must fail closed before string-literal matching.
 *
 * PortSwigger attack classes covered below are named in each describe/it title.
 */
import {
  canonicalizeHostToIp,
  isPrivateOrReservedIp,
  validateOutboundUrl,
} from "../src/egressValidator";

describe("isPrivateOrReservedIp (CIDR, not string literals)", () => {
  it.each([
    ["10.0.0.1", true],
    ["10.255.255.255", true],
    ["172.16.0.1", true],
    ["172.31.255.255", true],
    ["172.15.0.1", false],
    ["172.32.0.1", false],
    ["192.168.1.1", true],
    ["127.0.0.1", true],
    // PortSwigger: loopback beyond exact 127.0.0.1 (confirmed bypass pre-fix)
    ["127.0.0.2", true],
    ["127.1.2.3", true],
    ["0.0.0.0", true],
    ["0.1.2.3", true],
    ["169.254.169.254", true],
    ["169.254.0.1", true],
    ["8.8.8.8", false],
    ["1.1.1.1", false],
    ["::1", true],
    ["fc00::1", true],
    ["fd12:3456:789a::1", true],
    ["fe80::1", true],
    ["2001:4860:4860::8888", false],
  ])("%s → private=%s", (ip, expected) => {
    expect(isPrivateOrReservedIp(ip)).toBe(expected);
  });

  it("PortSwigger: treats IPv6-mapped private IPv4 as private", () => {
    expect(isPrivateOrReservedIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("::ffff:169.254.169.254")).toBe(true);
    expect(isPrivateOrReservedIp("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("::ffff:8.8.8.8")).toBe(false);
  });

  it("fail-closes on unparseable input", () => {
    expect(isPrivateOrReservedIp("")).toBe(true);
    expect(isPrivateOrReservedIp("not-an-ip")).toBe(true);
  });
});

describe("canonicalizeHostToIp", () => {
  it("passes through dotted IPv4 and IPv6", () => {
    expect(canonicalizeHostToIp("8.8.8.8")).toBe("8.8.8.8");
    expect(canonicalizeHostToIp("::1")).toBe("::1");
  });

  it("PortSwigger: decodes decimal IPv4 (loopback / metadata encoding tricks)", () => {
    // 127.0.0.1
    expect(canonicalizeHostToIp("2130706433")).toBe("127.0.0.1");
    // 169.254.169.254
    expect(canonicalizeHostToIp("2852039166")).toBe("169.254.169.254");
  });

  it("unwraps IPv6-mapped form", () => {
    expect(canonicalizeHostToIp("::ffff:127.0.0.1")).toBe("127.0.0.1");
    expect(canonicalizeHostToIp("::ffff:7f00:1")).toBe("127.0.0.1");
  });

  it("returns null for ordinary hostnames", () => {
    expect(canonicalizeHostToIp("example.com")).toBeNull();
    expect(canonicalizeHostToIp("localhost")).toBeNull();
  });
});

describe("validateOutboundUrl — PortSwigger SSRF classes", () => {
  it("blocks decimal-encoded loopback (blacklist filter bypass)", async () => {
    const result = await validateOutboundUrl("http://2130706433/");
    expect(result.ok).toBe(false);
  });

  it("blocks shortened / non-.1 loopback (confirmed bypass: 127.0.0.2)", async () => {
    const result = await validateOutboundUrl("http://127.0.0.2/");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Private network targets are blocked/i);
  });

  it("blocks 0.0.0.0 / this-network via http://0/ (confirmed bypass)", async () => {
    const result = await validateOutboundUrl("http://0/");
    expect(result.ok).toBe(false);
  });

  it("blocks IPv6-mapped metadata address", async () => {
    const result = await validateOutboundUrl("http://[::ffff:169.254.169.254]/");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Private|Localhost|blocked/i);
  });

  it("blocks IPv6-mapped loopback hex form", async () => {
    const result = await validateOutboundUrl("http://[::ffff:7f00:1]/");
    expect(result.ok).toBe(false);
  });

  it("blocks dotted metadata literal (link-local / cloud IMDS)", async () => {
    const result = await validateOutboundUrl(
      "http://169.254.169.254/latest/meta-data"
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Private network targets are blocked");
  });

  it("blocks IPv6 link-local fe80::", async () => {
    const result = await validateOutboundUrl("http://[fe80::1]/");
    expect(result.ok).toBe(false);
  });

  it("blocks userinfo / embedded credentials (whitelist filter bypass)", async () => {
    const result = await validateOutboundUrl("http://evil.com@127.0.0.1/");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/credential/i);
  });

  it("blocks non-HTTP schemes", async () => {
    const result = await validateOutboundUrl("file:///etc/passwd");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/http\/https/i);
  });

  it("allows a public IPv4 literal over https", async () => {
    const result = await validateOutboundUrl("https://8.8.8.8/");
    expect(result.ok).toBe(true);
  });

  it("blocks plain HTTP to a public IP by default (HTTPS-only)", async () => {
    const previous = process.env["AI_EGRESS_REQUIRE_HTTPS"];
    delete process.env["AI_EGRESS_REQUIRE_HTTPS"];
    try {
      const result = await validateOutboundUrl("http://8.8.8.8/");
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/Plain-HTTP egress is blocked/i);
    } finally {
      if (previous === undefined) delete process.env["AI_EGRESS_REQUIRE_HTTPS"];
      else process.env["AI_EGRESS_REQUIRE_HTTPS"] = previous;
    }
  });

  it("allows plain HTTP to a public IP only when AI_EGRESS_REQUIRE_HTTPS=false", async () => {
    const previous = process.env["AI_EGRESS_REQUIRE_HTTPS"];
    process.env["AI_EGRESS_REQUIRE_HTTPS"] = "false";
    try {
      const result = await validateOutboundUrl("http://8.8.8.8/");
      expect(result.ok).toBe(true);
    } finally {
      if (previous === undefined) delete process.env["AI_EGRESS_REQUIRE_HTTPS"];
      else process.env["AI_EGRESS_REQUIRE_HTTPS"] = previous;
    }
  });
});
