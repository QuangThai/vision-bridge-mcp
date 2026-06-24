import { describe, expect, it } from "vitest";
import {
  checkContentSafety,
  formatContentSafetyWarnings,
} from "../../src/security/content-safety.js";

describe("checkContentSafety", () => {
  it("detects email addresses", () => {
    const result = checkContentSafety("Contact: user@example.com");
    expect(result.safe).toBe(false);
    expect(result.findings.some((f) => f.category === "email")).toBe(true);
    expect(result.findings.find((f) => f.category === "email")?.count).toBe(1);
  });

  it("detects multiple emails", () => {
    const result = checkContentSafety("a@b.com c@d.com e@f.com");
    expect(result.findings.find((f) => f.category === "email")?.count).toBe(3);
  });

  it("detects phone numbers", () => {
    const result = checkContentSafety("Call: 555-123-4567");
    expect(result.safe).toBe(false);
    expect(result.findings.some((f) => f.category === "phone")).toBe(true);
  });

  it("detects SSN", () => {
    const result = checkContentSafety("SSN: 123-45-6789");
    expect(result.safe).toBe(false);
    expect(result.findings.some((f) => f.category === "ssn")).toBe(true);
  });

  it("detects credit card numbers", () => {
    const result = checkContentSafety("Card: 4111-1111-1111-1111");
    expect(result.safe).toBe(false);
    expect(result.findings.some((f) => f.category === "credit_card")).toBe(true);
  });

  it("detects IP addresses", () => {
    const result = checkContentSafety("Server: 192.168.1.1");
    expect(result.safe).toBe(false);
    expect(result.findings.some((f) => f.category === "ip_address")).toBe(true);
  });

  it("detects URL-embedded credentials", () => {
    const result = checkContentSafety("https://user:pass@example.com");
    expect(result.safe).toBe(false);
    expect(result.findings.some((f) => f.category === "url_credentials")).toBe(true);
  });

  it("returns safe for normal text", () => {
    const result = checkContentSafety("Hello world, this is a normal paragraph.");
    expect(result.safe).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it("returns safe for empty text", () => {
    const result = checkContentSafety("");
    expect(result.safe).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it("respects enabled option", () => {
    const result = checkContentSafety("user@example.com", { enabled: false });
    expect(result.safe).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it("detects multiple PII categories simultaneously", () => {
    const result = checkContentSafety("Email: user@example.com, Phone: 555-123-4567, IP: 10.0.0.1");
    expect(result.safe).toBe(false);
    expect(result.findings.length).toBeGreaterThanOrEqual(3);
  });
});

describe("formatContentSafetyWarnings", () => {
  it("returns empty for no findings", () => {
    const result = formatContentSafetyWarnings({ findings: [], safe: true });
    expect(result).toHaveLength(0);
  });

  it("formats warnings for single category", () => {
    const warnings = formatContentSafetyWarnings({
      findings: [{ category: "email", label: "Email address", count: 2 }],
      safe: false,
    });
    expect(warnings[0]).toContain("Email address");
    expect(warnings[0]).toContain("2");
  });

  it("formats warnings for multiple categories", () => {
    const warnings = formatContentSafetyWarnings({
      findings: [
        { category: "email", label: "Email address", count: 1 },
        { category: "phone", label: "Phone number", count: 3 },
      ],
      safe: false,
    });
    expect(warnings).toHaveLength(2);
  });
});
