import { describe, expect, it } from "vitest";
import { formatRedactionWarnings, redactSecrets } from "../../src/security/redact.js";

describe("redactSecrets", () => {
  it("redacts OpenAI-style API keys when enabled", () => {
    const result = redactSecrets("Use key sk-abcdefghijklmnopqrstuvwxyz123456", true);

    expect(result.redacted).toBe(true);
    expect(result.text).toContain("[REDACTED]");
    expect(result.text).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
    expect(result.findings.some((finding) => finding.pattern === "openai_api_key")).toBe(true);
  });

  it("redacts generic secret assignments", () => {
    const result = redactSecrets("password=SuperSecret123", true);

    expect(result.redacted).toBe(true);
    expect(result.text).toBe("password=[REDACTED]");
  });

  it("leaves text unchanged when redaction is disabled", () => {
    const input = "password=SuperSecret123";
    const result = redactSecrets(input, false);

    expect(result).toEqual({
      text: input,
      redacted: false,
      findings: [],
    });
  });

  it("formats redaction warnings for OCR output", () => {
    const warnings = formatRedactionWarnings([
      { pattern: "openai_api_key", count: 1 },
      { pattern: "password_assignment", count: 2 },
    ]);

    expect(warnings[0]).toContain("Redacted 3 possible secret");
  });
});
