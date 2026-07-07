/**
 * Content safety module for Atlas Vision MCP.
 *
 * Scans extracted text for potentially sensitive data (PII, secrets, credentials)
 * and returns warnings. This runs AFTER provider extraction — it does NOT
 * prevent sending data to the provider.
 */

export interface ContentSafetyFinding {
  category: string;
  label: string;
  count: number;
}

export interface ContentSafetyResult {
  findings: ContentSafetyFinding[];
  safe: boolean;
}

const PII_PATTERNS: Array<{ category: string; label: string; regex: RegExp }> = [
  {
    category: "email",
    label: "Email address",
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    category: "phone",
    label: "Phone number",
    // Simplified pattern to avoid ReDoS: remove nested optional groups
    regex: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/g,
  },
  {
    category: "ssn",
    label: "Social Security Number",
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  {
    category: "credit_card",
    label: "Credit card number",
    regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  },
  {
    category: "ip_address",
    label: "IP address",
    regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
  },
  {
    category: "url_credentials",
    label: "URL-embedded credentials",
    regex: /\bhttps?:\/\/[^\s:@]+:[^\s:@]+@/gi,
  },
];

export interface ContentSafetyOptions {
  enabled?: boolean;
  patterns?: Array<{ category: string; label: string; regex: RegExp }>;
}

export function checkContentSafety(
  text: string,
  options: ContentSafetyOptions = {},
): ContentSafetyResult {
  if (!options.enabled && options.enabled !== undefined) {
    return { findings: [], safe: true };
  }

  if (!text || text.length === 0) {
    return { findings: [], safe: true };
  }

  const patterns = options.patterns ?? PII_PATTERNS;
  const findings: ContentSafetyFinding[] = [];

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.regex.source, "g");
    const count = (text.match(regex) || []).length;
    if (count > 0) {
      findings.push({
        category: pattern.category,
        label: pattern.label,
        count,
      });
    }
  }

  return {
    findings,
    safe: findings.length === 0,
  };
}

export function formatContentSafetyWarnings(result: ContentSafetyResult): string[] {
  if (result.findings.length === 0) {
    return [];
  }

  const warnings: string[] = [];
  for (const finding of result.findings) {
    warnings.push(
      `Content safety: found ${finding.count} ${finding.label}(s) in extracted text. Verify this data is intended for processing.`,
    );
  }
  return warnings;
}
