/*
 * Dual-pass cognitive protocol — scratchpad + governed_action split/validate.
 *
 * Spec partitions:
 * - Valid: both XML tags present, JSON action with tool or halt
 * - Invalid: missing tag, empty scratchpad, non-JSON action, narrative in action
 * - Audits: grounding (selector absent from snapshot), mechanism mismatch, sensor tampering
 */

import {
  GovernanceException,
  extractXmlTag,
  parseDualPassOutput,
  validateGovernedAction,
  auditDualPass,
  validateDualPassCompletion,
  assertDualPassDispatch,
} from "../src/dualPassProtocol";

const SAFE_TURN = `
<cognitive_scratchpad>
[LEVEL 1 PERCEPTION]
Target page URL is 'https://portal.zeroapi.com/dashboard'.
Raw DOM snapshot contains a selector input[name="auth-token"] and button#submit.

[LEVEL 3 META-AWARENESS & AUDIT]
- Stated Intent: click submit.
- Dispatched Action: playwright.click on button#submit.
- Check: Plan matches action. No logging bypass.
- Outcome: Safe to proceed.
</cognitive_scratchpad>

<governed_action>
{
  "tool": "playwright.click",
  "selector": "button#submit",
  "waitForNavigation": true
}
</governed_action>
`.trim();

const ENV_SNAPSHOT =
  'url=https://portal.zeroapi.com/dashboard html=<input name="auth-token"/><button id="submit">Go</button>';

describe("extractXmlTag", () => {
  it("extracts inner content for a named tag", () => {
    expect(extractXmlTag("<a>hello</a>", "a")).toBe("hello");
  });

  it("returns null when tag is missing", () => {
    expect(extractXmlTag("no tags", "cognitive_scratchpad")).toBeNull();
  });
});

describe("parseDualPassOutput", () => {
  it("splits scratchpad and governed_action from a valid turn", () => {
    const parsed = parseDualPassOutput(SAFE_TURN);
    expect(parsed.cognitive_scratchpad).toContain("LEVEL 1 PERCEPTION");
    expect(parsed.governed_action).toEqual({
      tool: "playwright.click",
      selector: "button#submit",
      waitForNavigation: true,
    });
  });

  it("accepts halt payloads", () => {
    const raw = `
<cognitive_scratchpad>Missing objective — halt.</cognitive_scratchpad>
<governed_action>{"halt":true,"reason":"missing objective"}</governed_action>
`;
    const parsed = parseDualPassOutput(raw);
    expect(parsed.governed_action).toMatchObject({ halt: true });
  });

  it("throws GovernanceException when scratchpad is missing", () => {
    expect(() =>
      parseDualPassOutput(`<governed_action>{"tool":"x"}</governed_action>`)
    ).toThrow(GovernanceException);
  });

  it("throws when governed_action JSON is invalid", () => {
    expect(() =>
      parseDualPassOutput(`
<cognitive_scratchpad>plan</cognitive_scratchpad>
<governed_action>not-json</governed_action>
`)
    ).toThrow(/governed_action/i);
  });
});

describe("validateGovernedAction", () => {
  it("accepts tool payloads", () => {
    expect(validateGovernedAction({ tool: "playwright.click", selector: "#a" }).ok).toBe(
      true
    );
  });

  it("accepts halt payloads", () => {
    expect(validateGovernedAction({ halt: true }).ok).toBe(true);
  });

  it("rejects empty objects", () => {
    const result = validateGovernedAction({});
    expect(result.ok).toBe(false);
  });
});

describe("auditDualPass", () => {
  it("passes when selector is grounded in the environment snapshot", () => {
    const parsed = parseDualPassOutput(SAFE_TURN);
    const audit = auditDualPass({
      scratchpad: parsed.cognitive_scratchpad,
      action: parsed.governed_action,
      environmentSnapshot: ENV_SNAPSHOT,
    });
    expect(audit.ok).toBe(true);
  });

  it("fails Grounding Rule when selector is absent from snapshot", () => {
    const audit = auditDualPass({
      scratchpad: "Plan: click button#ghost",
      action: { tool: "playwright.click", selector: "button#ghost" },
      environmentSnapshot: ENV_SNAPSHOT,
    });
    expect(audit.ok).toBe(false);
    if (!audit.ok) {
      expect(audit.rule).toBe("grounding");
      expect(audit.halt).toBe(true);
    }
  });

  it("fails Mechanism Mismatch when benign plan uses invasive tool", () => {
    const audit = auditDualPass({
      scratchpad: "Routine scrape of property prices from the listing page.",
      action: { tool: "browser.eval", code: "localStorage.clear()" },
      environmentSnapshot: "listing page html",
    });
    expect(audit.ok).toBe(false);
    if (!audit.ok) {
      expect(audit.rule).toBe("mechanism_mismatch");
    }
  });

  it("fails Sensor Tampering Check on log deletion", () => {
    const audit = auditDualPass({
      scratchpad: "Clean up after ourselves by deleting Sentry hooks.",
      action: { tool: "shell.run", command: "rm -rf logs/sentry" },
      environmentSnapshot: "cwd=/app",
    });
    expect(audit.ok).toBe(false);
    if (!audit.ok) {
      expect(audit.rule).toBe("sensor_tampering");
    }
  });
});

describe("validateDualPassCompletion", () => {
  it("returns allowed dispatch for a safe turn", () => {
    const result = validateDualPassCompletion(SAFE_TURN, {
      environmentSnapshot: ENV_SNAPSHOT,
    });
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.action.tool).toBe("playwright.click");
    }
  });

  it("returns halt when payload requests halt", () => {
    const raw = `
<cognitive_scratchpad>No objective.</cognitive_scratchpad>
<governed_action>{"halt":true,"reason":"missing objective"}</governed_action>
`;
    const result = validateDualPassCompletion(raw);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.halt).toBe(true);
    }
  });
});

describe("assertDualPassDispatch", () => {
  it("accepts tool_call + scratchpad content (OpenAI tool-calling bridge)", () => {
    const result = assertDualPassDispatch({
      content: `<cognitive_scratchpad>
Plan: scrape listings. DOM has .price.
Outcome: Safe.
</cognitive_scratchpad>`,
      toolCall: { name: "scrape_website", arguments: { url: "https://example.com" } },
      environmentSnapshot: "html=<span class=\"price\">$10</span>",
      highImpact: true,
    });
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.action.tool).toBe("scrape_website");
    }
  });

  it("fail-closes high-impact tool calls without scratchpad when strict", () => {
    expect(() =>
      assertDualPassDispatch({
        content: "",
        toolCall: { name: "scrape_website", arguments: { url: "https://x.com" } },
        highImpact: true,
        strict: true,
      })
    ).toThrow(GovernanceException);
  });

  it("allows non-high-impact tool calls without dual-pass when not strict", () => {
    const result = assertDualPassDispatch({
      content: "Sure, listing your tasks.",
      toolCall: { name: "list_tasks", arguments: {} },
      highImpact: false,
      strict: false,
    });
    expect(result.allowed).toBe(true);
  });
});
