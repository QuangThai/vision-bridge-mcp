import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

const HOOK_ENV_KEYS = [
  "VISION_PROVIDER",
  "VISION_BASE_URL",
  "VISION_API_KEY",
  "VISION_MODEL",
  "VISION_TIMEOUT_MS",
  "VISION_MAX_IMAGE_MB",
  "VISION_MAX_OUTPUT_TOKENS",
  "MAIN_MODEL_REF",
  "MAIN_MODEL_PROVIDER",
  "CURSOR_UNDERLYING_MODEL",
  "ATLAS_UNDERLYING_MODEL",
  "ATLAS_ALLOWED_DIRS",
  "ATLAS_SKIP_INTERCEPT",
  "ATLAS_FORCE_INTERCEPT",
  "ATLAS_REDACT_SECRETS",
  "ATLAS_DEFAULT_DETAIL_LEVEL",
  "ATLAS_CLIPBOARD_DETECT",
] as const;

export function parseDotenv(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key.length > 0) {
      result[key] = value;
    }
  }

  return result;
}

function resolveHookEnvPath(path: string, cwd: string): string {
  return isAbsolute(path) ? path : join(cwd, path);
}

export function hookEnvFileCandidates(cwd: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const candidates: string[] = [];

  const explicit = env.ATLAS_VISION_ENV_FILE?.trim();
  if (explicit) {
    candidates.push(resolveHookEnvPath(explicit, cwd));
  }

  candidates.push(join(cwd, ".env"));
  candidates.push(join(homedir(), ".config", "atlas-vision", "env"));
  candidates.push(join(homedir(), ".atlas-vision.env"));

  return candidates;
}

export async function loadHookEnv(
  cwd: string,
  baseEnv: NodeJS.ProcessEnv = process.env,
): Promise<NodeJS.ProcessEnv> {
  const merged: NodeJS.ProcessEnv = { ...baseEnv };

  for (const filePath of hookEnvFileCandidates(cwd, baseEnv)) {
    let content: string;
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      continue;
    }

    const parsed = parseDotenv(content);
    for (const key of HOOK_ENV_KEYS) {
      if (merged[key]?.trim()) {
        continue;
      }
      const value = parsed[key];
      if (value?.trim()) {
        merged[key] = value;
      }
    }
  }

  return merged;
}
