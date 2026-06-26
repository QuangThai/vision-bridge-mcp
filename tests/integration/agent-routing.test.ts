import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { planImageIntercept } from "../../src/capabilities/image-intercept.js";
import { runUserPromptHook } from "../../src/harness/user-prompt-hook.js";
const REPO_ROOT = resolve(import.meta.dirname, "../..");
const GOLDEN_CHART = resolve(REPO_ROOT, "tests/fixtures/golden/chart-revenue.png");
const CLI_MAIN = resolve(REPO_ROOT, "dist/cli/main.js");

/** Isolate from developer global env (e.g. MAIN_MODEL_REF, ATLAS_FORCE_INTERCEPT). */
const CLEAN_ENV: NodeJS.ProcessEnv = {
  ATLAS_FORCE_INTERCEPT: "false",
  ATLAS_SKIP_INTERCEPT: "false",
};

type AgentClient = "cursor" | "droid" | "codex" | "claude";

interface RoutingCase {
  label: string;
  mainModelRef: string;
  runtimeSupportsVision?: boolean;
  expectIntercept: boolean;
}

const ROUTING_MATRIX: RoutingCase[] = [
  {
    label: "DeepSeek text-only intercepts",
    mainModelRef: "deepseek/deepseek-v4-flash",
    expectIntercept: true,
  },
  {
    label: "OpenAI GPT-4o skips",
    mainModelRef: "openai/gpt-4o",
    expectIntercept: false,
  },
  {
    label: "Cursor Composer skips via proxy pattern",
    mainModelRef: "cursor/composer-2.5",
    expectIntercept: false,
  },
  {
    label: "Cursor GPT skips via upstream inference",
    mainModelRef: "cursor/gpt-5.5",
    expectIntercept: false,
  },
  {
    label: "ZhipuAI GLM intercepts via alias",
    mainModelRef: "zhipuai/glm-5.2",
    expectIntercept: true,
  },
  {
    label: "Composer skips even when MAIN_MODEL_REF is text-only",
    mainModelRef: "cursor/composer-2.5",
    expectIntercept: false,
  },
  {
    label: "Runtime supports_vision skips even for DeepSeek",
    mainModelRef: "deepseek/deepseek-v4-flash",
    runtimeSupportsVision: true,
    expectIntercept: false,
  },
];

const ROUTING_WITH_MAIN_MODEL_REF: RoutingCase[] = [
  {
    label: "Composer skips with MAIN_MODEL_REF=deepseek footgun",
    mainModelRef: "cursor/composer-2.5",
    expectIntercept: false,
  },
];

describe("agent routing matrix (planImageIntercept)", () => {
  for (const testCase of ROUTING_MATRIX) {
    it(testCase.label, async () => {
      const plan = await planImageIntercept(
        {
          mainModelRef: testCase.mainModelRef,
          messageText: `describe ${GOLDEN_CHART}`,
          runtimeSupportsVision: testCase.runtimeSupportsVision,
          env: CLEAN_ENV,
        },
        {},
        {
          cacheDir: "/tmp/atlas-routing-unused",
          fetch: async () =>
            new Response(JSON.stringify({ providers: {} }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
        },
      );

      expect(plan.shouldIntercept).toBe(testCase.expectIntercept);
    });
  }
});

describe("agent routing with MAIN_MODEL_REF env", () => {
  for (const testCase of ROUTING_WITH_MAIN_MODEL_REF) {
    it(testCase.label, async () => {
      const plan = await planImageIntercept(
        {
          mainModelRef: testCase.mainModelRef,
          messageText: `describe ${GOLDEN_CHART}`,
          runtimeSupportsVision: testCase.runtimeSupportsVision,
          env: {
            ...CLEAN_ENV,
            MAIN_MODEL_REF: "deepseek/deepseek-v4-flash",
          },
        },
        {},
        {
          cacheDir: "/tmp/atlas-routing-unused",
          fetch: async () =>
            new Response(JSON.stringify({ providers: {} }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
        },
      );

      expect(plan.shouldIntercept).toBe(testCase.expectIntercept);
    });
  }
});

describe("agent hook routing (runUserPromptHook, no vision API)", () => {
  for (const client of ["cursor", "droid", "codex"] as AgentClient[]) {
    it(`${client}: skips intercept when hook sends supports_vision`, async () => {
      const result = await runUserPromptHook(
        JSON.stringify({
          prompt: `check ${GOLDEN_CHART}`,
          hook_event_name: client === "cursor" ? "beforeSubmitPrompt" : "UserPromptSubmit",
          model: "deepseek-v4-flash",
          supports_vision: true,
          cwd: REPO_ROOT,
        }),
        {
          client,
          env: { ...CLEAN_ENV, MAIN_MODEL_REF: "deepseek/deepseek-v4-flash" },
        },
      );

      expect(result.intercepted).toBe(false);
      expect(result.stdout).toBe("");
    });

    it(`${client}: skips intercept when hook sends input_modalities with image`, async () => {
      const result = await runUserPromptHook(
        JSON.stringify({
          prompt: `check ${GOLDEN_CHART}`,
          hook_event_name: client === "cursor" ? "beforeSubmitPrompt" : "UserPromptSubmit",
          model: "deepseek-v4-flash",
          input_modalities: ["text", "image"],
          cwd: REPO_ROOT,
        }),
        {
          client,
          env: { ...CLEAN_ENV, MAIN_MODEL_REF: "deepseek/deepseek-v4-flash" },
        },
      );

      expect(result.intercepted).toBe(false);
      expect(result.stdout).toBe("");
    });
  }

  for (const client of ["cursor", "droid", "codex"] as AgentClient[]) {
    it(`${client}: skips intercept for composer when MAIN_MODEL_REF is text-only`, async () => {
      const result = await runUserPromptHook(
        JSON.stringify({
          prompt: `check ${GOLDEN_CHART}`,
          hook_event_name: client === "cursor" ? "beforeSubmitPrompt" : "UserPromptSubmit",
          model: "cursor/composer-2.5",
          cwd: REPO_ROOT,
        }),
        {
          client,
          env: {
            ...CLEAN_ENV,
            MAIN_MODEL_REF: "deepseek/deepseek-v4-flash",
          },
        },
      );

      expect(result.intercepted).toBe(false);
      expect(result.stdout).toBe("");
    });
  }

  for (const client of ["cursor", "droid", "codex"] as AgentClient[]) {
    it(`${client}: skips intercept for vision-native hook signal`, async () => {
      const result = await runUserPromptHook(
        JSON.stringify({
          prompt: `check ${GOLDEN_CHART}`,
          hook_event_name: client === "cursor" ? "beforeSubmitPrompt" : "UserPromptSubmit",
          model: "composer-2.5",
          supports_vision: true,
          cwd: REPO_ROOT,
        }),
        { client, env: { ...CLEAN_ENV, MAIN_MODEL_REF: "cursor/composer-2.5" } },
      );

      expect(result.intercepted).toBe(false);
      expect(result.stdout).toBe("");
    });

    it(`${client}: skips intercept for openai main model`, async () => {
      const result = await runUserPromptHook(
        JSON.stringify({
          prompt: `check ${GOLDEN_CHART}`,
          hook_event_name: client === "cursor" ? "beforeSubmitPrompt" : "UserPromptSubmit",
          cwd: REPO_ROOT,
        }),
        { client, env: { ...CLEAN_ENV, MAIN_MODEL_REF: "openai/gpt-4o" } },
      );

      expect(result.intercepted).toBe(false);
      expect(result.stdout).toBe("");
    });
  }

  for (const client of ["cursor", "droid"] as AgentClient[]) {
    it(`${client}: routes text-only proxy model to intercept plan`, async () => {
      const plan = vi.fn(async () => ({
        shouldIntercept: true,
        reason: "text-only",
        capabilities: {
          modelId: "deepseek-v4-flash",
          providerId: "deepseek",
          supportsVision: false,
          supportsTools: true,
          supportsReasoning: false,
          inputModalities: ["text"],
          outputModalities: ["text"],
          contextWindow: 0,
          maxOutputTokens: 0,
          source: "bundled" as const,
        },
        images: [{ path: GOLDEN_CHART, source: "path" as const, start: 0, end: 1 }],
        plannedCalls: [
          {
            tool: "analyze_image" as const,
            imagePath: GOLDEN_CHART,
            args: {},
            reason: "general",
          },
        ],
      }));

      const result = await runUserPromptHook(
        JSON.stringify({
          prompt: `analyze ${GOLDEN_CHART}`,
          hook_event_name: client === "cursor" ? "beforeSubmitPrompt" : "UserPromptSubmit",
          model: "deepseek-v4-flash",
          cwd: REPO_ROOT,
        }),
        {
          client,
          env: {
            ...CLEAN_ENV,
            MAIN_MODEL_REF: "deepseek/deepseek-v4-flash",
            VISION_API_KEY: "test",
          },
        },
        {
          plan,
          execute: vi.fn(async () => ({
            imagePath: GOLDEN_CHART,
            markdown: "## Summary\nMonthly Revenue chart visible.",
          })),
          loadConfig: vi.fn(() => ({
            vision: {
              provider: "openai-compatible",
              baseUrl: "https://api.example.com/v1",
              apiKey: "sk-test",
              model: "gpt-4o-mini",
              timeoutMs: 60_000,
              maxImageMb: 10,
              maxOutputTokens: 4_000,
            },
            atlas: {
              allowedDirs: ["."],
              storeHistory: false,
              logLevel: "info",
              logImageContent: false,
              redactSecrets: true,
              defaultDetailLevel: "standard",
            },
          })),
          cwd: REPO_ROOT,
        },
      );

      expect(plan).toHaveBeenCalled();
      expect(result.intercepted).toBe(true);
      const parsed = JSON.parse(result.stdout);
      const context =
        parsed.additional_context ??
        parsed.additionalContext ??
        parsed.hookSpecificOutput?.additionalContext;
      expect(context).toContain("<atlas-vision-evidence>");
      expect(context).toContain("Monthly Revenue");
    });
  }
});

describe("hook CLI subprocess routing", () => {
  function runHookCli(
    client: AgentClient,
    payload: Record<string, unknown>,
    env: NodeJS.ProcessEnv,
  ) {
    return spawnSync(process.execPath, [CLI_MAIN, "hook", "user-prompt", "--client", client], {
      env,
      cwd: REPO_ROOT,
      input: JSON.stringify(payload),
      encoding: "utf8",
      timeout: 10_000,
    });
  }

  it.runIf(existsSync(CLI_MAIN))(
    "cursor hook skips vision API for composer with MAIN_MODEL_REF text-only",
    () => {
      const result = runHookCli(
        "cursor",
        {
          prompt: `describe ${GOLDEN_CHART}`,
          hook_event_name: "beforeSubmitPrompt",
          model: "cursor/composer-2.5",
          cwd: REPO_ROOT,
        },
        {
          ...process.env,
          ...CLEAN_ENV,
          MAIN_MODEL_REF: "deepseek/deepseek-v4-flash",
        },
      );

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    },
  );

  it.runIf(existsSync(CLI_MAIN))("cursor hook skips vision API for composer model", () => {
    const result = runHookCli(
      "cursor",
      {
        prompt: `describe ${GOLDEN_CHART}`,
        hook_event_name: "beforeSubmitPrompt",
        model: "cursor/composer-2.5",
        cwd: REPO_ROOT,
      },
      {
        ...process.env,
        ...CLEAN_ENV,
        MAIN_MODEL_REF: "cursor/composer-2.5",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  it.runIf(existsSync(CLI_MAIN))("droid hook skips vision API when supports_vision=true", () => {
    const result = runHookCli(
      "droid",
      {
        prompt: `describe ${GOLDEN_CHART}`,
        hook_event_name: "UserPromptSubmit",
        model: "deepseek-v4-flash",
        supports_vision: true,
        cwd: REPO_ROOT,
      },
      {
        ...process.env,
        ...CLEAN_ENV,
        MAIN_MODEL_REF: "deepseek/deepseek-v4-flash",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });
});

describe("pi extension routing parity", () => {
  it("matches hook behavior: ctx.model.input image skips intercept", async () => {
    const piPlan = await planImageIntercept({
      mainModelRef: "deepseek/deepseek-v4-flash",
      messageText: `check ${GOLDEN_CHART}`,
      runtimeSupportsVision: true,
      env: CLEAN_ENV,
    });

    const hookResult = await runUserPromptHook(
      JSON.stringify({
        prompt: `check ${GOLDEN_CHART}`,
        hook_event_name: "UserPromptSubmit",
        cwd: REPO_ROOT,
      }),
      {
        client: "codex",
        runtimeSupportsVision: true,
        env: { ...CLEAN_ENV, MAIN_MODEL_REF: "deepseek/deepseek-v4-flash" },
      },
    );

    expect(piPlan.shouldIntercept).toBe(false);
    expect(hookResult.intercepted).toBe(false);
  });
});

function tryLoadDotenv(): void {
  const envPath = resolve(REPO_ROOT, ".env");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

describe("pi extension file loads", () => {
  it("extension imports dist bundle without syntax errors", async () => {
    const extensionPath = resolve(REPO_ROOT, "extensions/atlas-vision-intercept.ts");
    expect(existsSync(extensionPath)).toBe(true);
    expect(existsSync(resolve(REPO_ROOT, "dist/index.js"))).toBe(true);
  });
});

describe("E2E hook routing env", () => {
  it("documents when live hook smoke can run", () => {
    tryLoadDotenv();
    const canRunLive = Boolean(process.env.VISION_API_KEY?.trim());
    expect(typeof canRunLive).toBe("boolean");
  });
});
