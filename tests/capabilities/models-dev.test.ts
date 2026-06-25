import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ModelsDevClient,
  getModelCapabilities,
  parseModelRef,
} from "../../src/capabilities/models-dev.js";

const sampleCatalog = {
  providers: {
    deepseek: {
      models: {
        "deepseek-v4-flash": {
          name: "DeepSeek V4 Flash",
          attachment: false,
          tool_call: true,
          reasoning: true,
          modalities: {
            input: ["text"],
            output: ["text"],
          },
          limit: {
            context: 1_000_000,
            output: 8_000,
          },
        },
      },
    },
    openai: {
      models: {
        "gpt-4o-mini": {
          name: "GPT-4o mini",
          attachment: true,
          tool_call: true,
          modalities: {
            input: ["text", "image"],
            output: ["text"],
          },
          limit: {
            context: 128_000,
            output: 16_000,
          },
        },
      },
    },
  },
};

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function createCacheDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "atlas-models-dev-"));
  tempDirs.push(dir);
  return dir;
}

describe("parseModelRef", () => {
  it("parses provider/model refs", () => {
    expect(parseModelRef("deepseek/deepseek-v4-flash")).toEqual({
      providerId: "deepseek",
      modelId: "deepseek-v4-flash",
    });
  });

  it("uses fallback provider for bare model ids", () => {
    expect(parseModelRef("deepseek-v4-flash", "deepseek")).toEqual({
      providerId: "deepseek",
      modelId: "deepseek-v4-flash",
    });
  });
});

describe("ModelsDevClient", () => {
  it("detects vision from attachment or image modality", async () => {
    const cacheDir = await createCacheDir();
    const client = new ModelsDevClient({
      cacheDir,
      fetch: async () =>
        new Response(JSON.stringify(sampleCatalog), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: '"v1"' },
        }),
    });

    const noVision = await client.getModelCapabilities({
      providerId: "deepseek",
      modelId: "deepseek-v4-flash",
    });
    expect(noVision.supportsVision).toBe(false);
    // Bundled wins before models.dev — deepseek-v4-flash matches SPECIFIC_OVERRIDES
    expect(noVision.source).toBe("bundled");

    const withVision = await client.getModelCapabilities({
      providerId: "openai",
      modelId: "gpt-4o-mini",
    });
    expect(withVision.supportsVision).toBe(true);
    expect(withVision.inputModalities).toContain("image");
  });

  it("uses disk cache when fresh", async () => {
    const cacheDir = await createCacheDir();
    await writeFile(
      join(cacheDir, "models-dev.json"),
      JSON.stringify({
        fetchedAt: new Date().toISOString(),
        catalog: sampleCatalog,
      }),
      "utf8",
    );

    let fetchCalls = 0;
    const client = new ModelsDevClient({
      cacheDir,
      fetch: async () => {
        fetchCalls += 1;
        return new Response("{}", { status: 500 });
      },
    });

    const caps = await client.getModelCapabilities({
      providerId: "openai",
      modelId: "gpt-4o-mini",
    });

    expect(fetchCalls).toBe(0);
    expect(caps.supportsVision).toBe(true);
  });

  it("applies manual overrides", async () => {
    const cacheDir = await createCacheDir();
    const client = new ModelsDevClient({
      cacheDir,
      overrides: [
        {
          providerId: "deepseek",
          modelId: "deepseek-v4-flash",
          supportsVision: true,
        },
      ],
      fetch: async () =>
        new Response(JSON.stringify(sampleCatalog), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    });

    const caps = await client.getModelCapabilities({
      providerId: "deepseek",
      modelId: "deepseek-v4-flash",
    });

    expect(caps.supportsVision).toBe(true);
    expect(caps.source).toBe("override");
  });

  it("returns unknown capabilities when model is missing", async () => {
    const cacheDir = await createCacheDir();
    const client = new ModelsDevClient({
      cacheDir,
      fetch: async () =>
        new Response(JSON.stringify(sampleCatalog), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    });

    const caps = await client.getModelCapabilities({
      providerId: "glm",
      modelId: "glm-5.2",
    });

    expect(caps.supportsVision).toBe(false);
    // Bundled registry catches glm-5.2 before "unknown" fallback
    expect(caps.source).toBe("bundled");
  });

  it("persists fetched catalog to disk", async () => {
    const cacheDir = await createCacheDir();
    const client = new ModelsDevClient({
      cacheDir,
      fetch: async () =>
        new Response(JSON.stringify(sampleCatalog), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: '"v1"' },
        }),
    });

    await client.getCatalog();
    const raw = await readFile(join(cacheDir, "models-dev.json"), "utf8");
    const parsed = JSON.parse(raw) as { catalog: typeof sampleCatalog };
    expect(parsed.catalog.providers.openai?.models["gpt-4o-mini"]?.name).toBe("GPT-4o mini");
  });
});

describe("getModelCapabilities", () => {
  it("creates an isolated client when options are provided", async () => {
    const cacheDir = await createCacheDir();
    const caps = await getModelCapabilities(
      { providerId: "openai", modelId: "gpt-4o-mini" },
      {
        cacheDir,
        fetch: async () =>
          new Response(JSON.stringify(sampleCatalog), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      },
    );

    expect(caps.supportsVision).toBe(true);
  });
});
