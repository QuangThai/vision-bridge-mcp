import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/cli/commands.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../src/cli/commands.js")>();
  return {
    ...mod,
    runServeCommand: vi.fn(async () => 0),
  };
});

import { runDoctorCommand, runServeCommand } from "../../src/cli/commands.js";
import { runCli } from "../../src/cli/run.js";
import { ConfigError } from "../../src/config.js";
import { PACKAGE_NAME, VERSION } from "../../src/index.js";
import { createAtlasMcpServer } from "../../src/server.js";

const TOOL_NAMES = ["analyze_image", "ocr_image", "analyze_ui_screenshot", "compare_images"];

describe("publish smoke", () => {
  it("exposes package metadata for release", () => {
    expect(PACKAGE_NAME).toBe("atlas-vision-mcp");
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);

    const packageJson = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../package.json"), "utf8"),
    ) as { bin?: Record<string, string>; files?: string[] };

    expect(packageJson.bin?.["atlas-vision"]).toBe("dist/cli/main.js");
    expect(packageJson.files).toContain("dist");
    expect(packageJson.files).toContain("README.md");
  });

  it("registers all four MCP tools", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createAtlasMcpServer();
    await server.connect(serverTransport);

    const client = new Client({ name: "smoke-client", version: "1.0.0" });
    await client.connect(clientTransport);

    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name).sort();
    expect(names).toEqual([...TOOL_NAMES].sort());
  });

  it("defaults to MCP serve when invoked without a command", async () => {
    const code = await runCli([]);
    expect(code).toBe(0);
    expect(runServeCommand).toHaveBeenCalledOnce();
  });

  it("doctor command reports configuration issues without crashing", async () => {
    const code = await runDoctorCommand({
      loadConfig: () => {
        throw new ConfigError("VISION_API_KEY is required");
      },
      log: {
        log: () => undefined,
        error: () => undefined,
      },
    });

    expect(code).toBe(1);
  });
});
