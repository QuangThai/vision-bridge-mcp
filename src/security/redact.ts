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
  { name: "npm_token", regex: /\bnpm_[A-Za-z0-9]{10,}\b/g },
  { name: "github_token", regex: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g },
  { name: "gitlab_token", regex: /\bglpat-[A-Za-z0-9\-_]{10,}\b/g },
  { name: "slack_token", regex: /\b(xox[baprs]-[A-Za-z0-9]{10,})\b/g },
  { name: "discord_webhook", regex: /https:\/\/discord\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/g },
  { name: "telegram_token", regex: /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/g },
  { name: "google_api_key", regex: /\bAIza[0-9A-Za-z\-_]{35}\b/g },
  { name: "stripe_api_key", regex: /\b(sk|pk)_(live|test)_[0-9A-Za-z]{20,}\b/g },
  { name: "twilio_api_key", regex: /\bSK[0-9a-fA-F]{32}\b/g },
  {
    name: "heroku_api_key",
    regex: /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g,
  },
  {
    name: "ssh_private_key",
    regex:
      /-----BEGIN\s+(RSA|EC|DSA|OPENSSH)\s+PRIVATE\s+KEY-----[\s\S]*?-----END\s+(RSA|EC|DSA|OPENSSH)\s+PRIVATE\s+KEY-----/g,
  },
  {
    name: "pem_certificate",
    regex: /-----BEGIN\s+CERTIFICATE-----[\s\S]*?-----END\s+CERTIFICATE-----/g,
  },
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
