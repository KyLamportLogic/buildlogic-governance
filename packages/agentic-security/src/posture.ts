/**
 * Defense posture score from architecture control inventory.
 */

import type { AgenticPostureControl, AgenticPostureReport } from "./types";

const STATUS_WEIGHT: Record<AgenticPostureControl["status"], number> = {
  "wired-always": 1,
  "wired-when-configured": 0.75,
  "adapter-ready": 0.4,
  "blocked-needs-account": 0,
};

/**
 * Build a mathematical posture report.
 * defenseScore = mean(status weights); continuousCoverage = wired continuous / continuous controls.
 */
export function buildPostureReport(
  controls: AgenticPostureControl[]
): AgenticPostureReport {
  if (controls.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      defenseScore: 0,
      continuousCoverage: 0,
      controls: [],
      blocked: [],
      wired: [],
    };
  }

  const sum = controls.reduce(
    (acc, c) => acc + (STATUS_WEIGHT[c.status] ?? 0),
    0
  );
  const defenseScore = Math.round((sum / controls.length) * 1000) / 1000;

  const continuous = controls.filter((c) => c.continuous);
  const continuousWired = continuous.filter(
    (c) =>
      c.status === "wired-always" || c.status === "wired-when-configured"
  );
  const continuousCoverage =
    continuous.length === 0
      ? 1
      : Math.round((continuousWired.length / continuous.length) * 1000) / 1000;

  return {
    generatedAt: new Date().toISOString(),
    defenseScore,
    continuousCoverage,
    controls,
    blocked: controls
      .filter((c) => c.status === "blocked-needs-account")
      .map((c) => c.id),
    wired: controls
      .filter(
        (c) =>
          c.status === "wired-always" || c.status === "wired-when-configured"
      )
      .map((c) => c.id),
  };
}
