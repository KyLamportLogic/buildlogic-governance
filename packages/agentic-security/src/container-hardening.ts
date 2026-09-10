/**
 * Container runtime hardening — strip Mythos-class debug/dump tools from images.
 */

import type { ContainerHardeningFinding } from "./types";

/** Packages / binaries that enable process memory dumps and ptrace attach. */
export const BANNED_DEBUG_PACKAGES = new Set([
  "gdb",
  "gdb-minimal",
  "strace",
  "lldb",
  "readelf",
  "binutils",
  "procps",
  "dd",
  "gcc",
  "g++",
  "tshark",
  "tcpdump",
  "nmap",
  "netcat",
  "netcat-openbsd",
  "netcat-traditional",
  "ncat",
]);

export const MEMORY_HARDENING_RECOMMENDATIONS = [
  "kernel.yama.ptrace_scope=2",
  "mount /proc with hidepid=2 for agent UIDs",
  "never inject long-lived API tokens into process environ — use Infisical JIT / Secrets Manager",
] as const;

const INSTALL_LINE =
  /(?:apk\s+add|apt-get\s+install|apt\s+install|yum\s+install|dnf\s+install|microdnf\s+install)\b/i;

/**
 * Scan Dockerfile text for banned debug-tool package installs in the **final** stage.
 */
export function findBannedDebugToolsInDockerfile(
  file: string,
  content: string
): ContainerHardeningFinding[] {
  const findings: ContainerHardeningFinding[] = [];
  const lines = content.split(/\r?\n/);
  let lastFrom = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*FROM\s+/i.test(lines[i] ?? "")) lastFrom = i;
  }
  const isAiRuntime = /agentic|ai-runtime|inference/i.test(content);

  for (let i = lastFrom; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;
    if (!INSTALL_LINE.test(line)) continue;

    const tokens = line
      .replace(/[\\]/g, " ")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const seen = new Set<string>();
    for (const token of tokens) {
      const base = token.split(/[=@]/)[0]?.toLowerCase() ?? "";
      if (!BANNED_DEBUG_PACKAGES.has(base)) continue;
      if (base === "procps" && !isAiRuntime) continue;
      if (base === "dd") continue; // not a typical package name; avoid false positives
      if (seen.has(base)) continue;
      seen.add(base);
      findings.push({ file, package: base, line: i + 1 });
    }
  }

  return findings;
}
