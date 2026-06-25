import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Client config paths
// ---------------------------------------------------------------------------

interface ClientConfig {
  name: string;
  /** Path to the config file to create/merge */
  configPath: string;
  /** The atlas hook entry to merge in */
  hookEntry: Record<string, unknown>;
}

function getClients(): ClientConfig[] {
  const home = homedir();

  return [
    {
      name: "cursor",
      configPath: resolve(home, ".cursor", "hooks.json"),
      hookEntry: {
        version: 1,
        hooks: {
          beforeSubmitPrompt: [
            {
              command: "npx -y atlas-vision-mcp hook user-prompt --client cursor",
            },
          ],
          postToolUse: [
            {
              matcher: "Write",
              command: "npx -y atlas-vision-mcp hook capture-image",
            },
          ],
        },
      },
    },
    {
      name: "claude",
      configPath: resolve(home, ".claude", "settings.json"),
      hookEntry: {
        hooks: {
          UserPromptSubmit: [
            {
              hooks: [
                {
                  type: "command",
                  command: "npx -y atlas-vision-mcp hook user-prompt --client claude",
                  timeout: 120,
                },
              ],
            },
          ],
        },
      },
    },
    {
      name: "codex",
      configPath: resolve(home, ".codex", "hooks.json"),
      hookEntry: {
        hooks: {
          UserPromptSubmit: [
            {
              hooks: [
                {
                  type: "command",
                  command: "npx -y atlas-vision-mcp hook user-prompt --client codex",
                  timeoutSec: 120,
                },
              ],
            },
          ],
        },
      },
    },
    {
      name: "droid",
      configPath: resolve(home, ".factory", "hooks.json"),
      hookEntry: {
        hooks: {
          UserPromptSubmit: [
            {
              matcher: "",
              hooks: [
                {
                  type: "command",
                  command: "npx -y atlas-vision-mcp hook user-prompt --client droid",
                  timeout: 120,
                },
              ],
            },
          ],
        },
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Merge helpers
// ---------------------------------------------------------------------------

/**
 * Deep-merge an atlas hook entry into an existing JSON config.
 * Preserves existing hooks and adds atlas hooks if not already present.
 */
export function mergeHookConfig(
  existing: Record<string, unknown>,
  atlasEntry: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...existing };

  // Merge top-level keys
  for (const [key, value] of Object.entries(atlasEntry)) {
    if (!(key in result)) {
      // Key doesn't exist → add it
      result[key] = value;
      continue;
    }

    // Both existing and new are objects → recurse
    const existingVal = result[key];
    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof existingVal === "object" &&
      existingVal !== null &&
      !Array.isArray(existingVal)
    ) {
      result[key] = mergeHookConfig(
        existingVal as Record<string, unknown>,
        value as Record<string, unknown>,
      );
      continue;
    }

    // Both are arrays → merge unique items
    if (Array.isArray(value) && Array.isArray(existingVal)) {
      const merged = [...(existingVal as unknown[])];
      for (const item of value as unknown[]) {
        const itemStr = JSON.stringify(item);
        if (!(existingVal as unknown[]).some((e) => JSON.stringify(e) === itemStr)) {
          merged.push(item);
        }
      }
      result[key] = merged;
    }

    // Otherwise keep existing value
  }

  return result;
}

// ---------------------------------------------------------------------------
// Install command
// ---------------------------------------------------------------------------

export async function runInstallHooksCommand(args: string[]): Promise<number> {
  const [clientName] = args;

  if (!clientName || clientName === "--help") {
    console.log("Usage: atlas-vision install-hooks <cursor|claude|codex|droid>");
    console.log("");
    console.log("Installs Atlas Vision hooks into the client's hook config file.");
    console.log("Preserves any existing hooks — only adds Atlas entries.");
    return clientName ? 0 : 1;
  }

  const client = getClients().find((c) => c.name === clientName);
  if (!client) {
    console.error(`Unknown client: ${clientName}`);
    console.error("Supported clients: cursor, claude, codex, droid");
    return 1;
  }

  // Read existing config (if any)
  let existing: Record<string, unknown> = {};
  if (existsSync(client.configPath)) {
    try {
      const content = await readFile(client.configPath, "utf-8");
      existing = JSON.parse(content) as Record<string, unknown>;
      console.log(`  Found existing config: ${client.configPath}`);
    } catch (err) {
      console.error(`  Warning: could not parse existing config: ${err}`);
      existing = {};
    }
  }

  // Merge
  const merged = mergeHookConfig(existing, client.hookEntry);
  const json = `${JSON.stringify(merged, null, 2)}\n`;

  // Write
  await mkdir(dirname(client.configPath), { recursive: true });
  await writeFile(client.configPath, json, "utf-8");

  console.log(`  ✓ Atlas hooks installed for ${clientName}`);
  console.log(`  → ${client.configPath}`);
  console.log("");
  console.log("  Restart the client for hooks to take effect.");
  console.log("  Make sure VISION_API_KEY and VISION_BASE_URL are set in your environment.");

  return 0;
}
