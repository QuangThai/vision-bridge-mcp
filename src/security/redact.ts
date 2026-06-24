export interface RedactionFinding {
  pattern: string;
  count: number;
}

export interface RedactionResult {
  text: string;
  redacted: boolean;
  findings: RedactionFinding[];
}

const REDACTION_PLACEHOLDER = "[REDACTED]";

const SECRET_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: "openai_api_key", regex: /\bsk-[A-Za-z0-9]{10,}\b/g },
  { name: "bearer_token", regex: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi },
  { name: "aws_access_key", regex: /\b(AKIA[0-9A-Z]{16})\b/g },
  {
    name: "generic_secret_assignment",
    regex: /\b(api[_-]?key|token|secret|password|passwd|pwd)\s*[:=]\s*([^\s'"`,]+)/gi,
  },
  { name: "jwt", regex: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },
];

export function redactSecrets(text: string, enabled = true): RedactionResult {
  if (!enabled || text.length === 0) {
    return { text, redacted: false, findings: [] };
  }

  let redactedText = text;
  const findings: RedactionFinding[] = [];

  for (const pattern of SECRET_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    const matches = redactedText.match(regex);
    if (!matches || matches.length === 0) {
      continue;
    }

    redactedText = redactedText.replace(regex, (_match, ...groups) => {
      if (pattern.name === "generic_secret_assignment" && groups.length >= 2) {
        const label = groups[0] as string;
        return `${label}=${REDACTION_PLACEHOLDER}`;
      }
      return REDACTION_PLACEHOLDER;
    });

    findings.push({
      pattern: pattern.name,
      count: matches.length,
    });
  }

  return {
    text: redactedText,
    redacted: findings.length > 0,
    findings,
  };
}

export function formatRedactionWarnings(findings: RedactionFinding[]): string[] {
  if (findings.length === 0) {
    return [];
  }

  const total = findings.reduce((sum, finding) => sum + finding.count, 0);
  return [
    `Redacted ${total} possible secret value(s) from extracted text (${findings.map((finding) => finding.pattern).join(", ")}).`,
  ];
}
