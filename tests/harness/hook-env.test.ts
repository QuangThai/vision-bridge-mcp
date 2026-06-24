import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadHookEnv, parseDotenv } from "../../src/harness/hook-env.js";

let tempDirs: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

describe("parseDotenv", () => {
  it("parses key=value pairs and ignores comments", () => {
    expect(
      parseDotenv(`
# comment
VISION_API_KEY=sk-test
MAIN_MODEL_PROVIDER=deepseek
`),
    ).toEqual({
      VISION_API_KEY: "sk-test",
      MAIN_MODEL_PROVIDER: "deepseek",
    });
  });
});

describe("loadHookEnv", () => {
  it("loads missing keys from project .env without overriding process env", async () => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-hook-env-"));
    tempDirs.push(dir);
    await writeFile(
      join(dir, ".env"),
      "VISION_API_KEY=from-dotenv\nMAIN_MODEL_PROVIDER=deepseek\n",
      "utf8",
    );

    const env = await loadHookEnv(dir, {
      VISION_API_KEY: "already-set",
    });

    expect(env.VISION_API_KEY).toBe("already-set");
    expect(env.MAIN_MODEL_PROVIDER).toBe("deepseek");
  });
});
