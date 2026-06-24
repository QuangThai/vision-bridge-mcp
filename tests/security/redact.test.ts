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
      { pattern: "generic_secret_assignment", count: 2 },
    ]);

    expect(warnings[0]).toContain("Redacted 3 possible secret");
  });

  it("redacts npm tokens", () => {
    const result = redactSecrets("npm token = npm_abcdefghijklmnopqrstuvwxyz", true);
    expect(result.redacted).toBe(true);
  });

  it("redacts GitHub tokens", () => {
    const result = redactSecrets("ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", true);
    expect(result.redacted).toBe(true);
    expect(result.text).toContain("[REDACTED]");
    expect(result.findings.some((f) => f.pattern === "github_token")).toBe(true);
  });

  it("redacts GitLab tokens", () => {
    const result = redactSecrets("Token glpat-xxxxxxxxxxxxxxxxxxxx", true);
    expect(result.redacted).toBe(true);
    expect(result.text).not.toContain("glpat-");
  });

  it("redacts Slack tokens", () => {
    const result = redactSecrets("xoxb-xxxxxxxxxx-xxxxxxxxxx-xxxxxxxxxxxxxx", true);
    expect(result.redacted).toBe(true);
    expect(result.findings.some((f) => f.pattern === "slack_token")).toBe(true);
  });

  it("redacts Google API keys", () => {
    // Google API key: AIza + exactly 35 chars = 39 total
    const key = `AIza${"A".repeat(35)}`;
    const result = redactSecrets(key, true);
    expect(result.redacted).toBe(true);
    expect(result.findings.some((f) => f.pattern === "google_api_key")).toBe(true);
  });

  it("redacts Stripe API keys", () => {
    // Use dynamic construction to avoid GitHub push protection false positive
    const key = `sk_live_${"x".repeat(28)}`;
    const result = redactSecrets(key, true);
    expect(result.redacted).toBe(true);
    expect(result.findings.some((f) => f.pattern === "stripe_api_key")).toBe(true);
  });

  it("redacts Telegram bot tokens", () => {
    const result = redactSecrets("123456789:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", true);
    expect(result.redacted).toBe(true);
    expect(result.findings.some((f) => f.pattern === "telegram_token")).toBe(true);
  });

  it("redacts Discord webhooks", () => {
    const result = redactSecrets(
      "https://discord.com/api/webhooks/123456789/xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      true,
    );
    expect(result.redacted).toBe(true);
    expect(result.text).not.toContain("discord.com/api/webhooks");
  });

  it("redacts SSH private keys", () => {
    const result = redactSecrets(
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----",
      true,
    );
    expect(result.redacted).toBe(true);
    expect(result.findings.some((f) => f.pattern === "ssh_private_key")).toBe(true);
  });

  it("handles empty text gracefully", () => {
    const result = redactSecrets("", true);
    expect(result.redacted).toBe(false);
    expect(result.text).toBe("");
  });

  it("does not redact normal text", () => {
    const result = redactSecrets("Hello world, this is a normal sentence.", true);
    expect(result.redacted).toBe(false);
    expect(result.text).toBe("Hello world, this is a normal sentence.");
  });
});
