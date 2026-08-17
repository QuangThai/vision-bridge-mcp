import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  buildInterceptMessageText,
  hasToolResultImageCandidate,
  interceptImagesForTextModel,
  interceptToolResultImage,
  persistTemporaryAttachedImages,
} from "../dist/index.js";

/**
 * Auto-load atlas-vision env files from well-known locations.
 *
 * Priority (highest wins — user's `process.env` always takes precedence):
 *   1. `ATLAS_VISION_ENV_FILE` env var (explicit override)
 *   2. `~/.config/atlas-vision/env` (global, shared with hooks)
 *   3. `{cwd}/.env` (project root)
 */
function loadAtlasEnvFiles(cwd: string): void {
  const files = [
    ...(process.env.ATLAS_VISION_ENV_FILE ? [process.env.ATLAS_VISION_ENV_FILE] : []),
    join(homedir(), ".config", "atlas-vision", "env"),
    join(cwd, ".env"),
  ];

  for (const file of files) {
    if (!existsSync(file)) continue;
    try {
      const content = readFileSync(file, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        let key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        // Strip optional 'export ' prefix
        if (key.startsWith("export ")) key = key.slice(7).trim();
        // Strip surrounding quotes
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        // Never override an already-set env var
        if (!(key in process.env)) {
          process.env[key] = value;
        }
      }
    } catch {
      // skip unreadable files
    }
  }
}

function envFlag(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

type InterceptMode = "auto" | "on" | "off";

function initialInterceptMode(): InterceptMode {
  if (envFlag("ATLAS_SKIP_INTERCEPT")) return "off";
  if (envFlag("ATLAS_FORCE_INTERCEPT")) return "on";
  return "auto";
}

function interceptStatus(mode: InterceptMode): string {
  if (mode === "off") return "atlas: disabled";
  if (mode === "on") return "atlas: force intercept";
  return "atlas: auto intercept";
}

function resolveMainModelRef(model: { provider: string; id: string } | undefined): string | null {
  // Active pi model is authoritative — matches harness user-prompt-hook routing.
  if (model?.provider?.trim() && model?.id?.trim()) {
    return `${model.provider}/${model.id}`;
  }

  const override = process.env.MAIN_MODEL_REF?.trim();
  if (override) {
    return override;
  }

  return null;
}

export default function atlasVisionInterceptExtension(pi: ExtensionAPI) {
  // Load env on startup — no manual export needed.
  // User's existing process.env always takes priority.
  loadAtlasEnvFiles(process.cwd());

  // The command changes this session-only override. Environment flags remain the
  // durable default for new Pi sessions.
  let interceptMode = initialInterceptMode();
  let hasSessionOverride = false;
  let activeAnalyses = 0;

  const updateStatus = (ctx: { ui: { setStatus: (key: string, value: string) => void } }) => {
    ctx.ui.setStatus(
      "atlas-vision",
      activeAnalyses > 0 ? "atlas: analyzing image(s)..." : interceptStatus(interceptMode),
    );
  };
  const beginAnalysis = (ctx: Parameters<typeof updateStatus>[0]) => {
    activeAnalyses += 1;
    updateStatus(ctx);
  };
  const endAnalysis = (ctx: Parameters<typeof updateStatus>[0]) => {
    activeAnalyses = Math.max(0, activeAnalyses - 1);
    updateStatus(ctx);
  };

  pi.registerCommand("atlas", {
    description: "Set Atlas Vision image interception: on, off, auto, or status",
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase();

      if (!action || action === "status") {
        ctx.ui.notify(`Atlas vision interception is ${interceptMode}.`, "info");
        return;
      }

      if (action === "on" || action === "enable") {
        interceptMode = "on";
      } else if (action === "off" || action === "disable") {
        interceptMode = "off";
      } else if (action === "auto") {
        interceptMode = "auto";
      } else {
        ctx.ui.notify("Usage: /atlas [on|off|auto|status]", "warning");
        return;
      }

      hasSessionOverride = true;
      updateStatus(ctx);
      ctx.ui.notify(
        `Atlas vision interception is ${interceptMode === "off" ? "disabled" : interceptMode === "on" ? "forced on" : "automatic"}.`,
        "info",
      );
    },
  });

  pi.on("session_start", (_event, ctx) => {
    // Re-check with session cwd (e.g. if pi was started in a different directory)
    loadAtlasEnvFiles(ctx.cwd);
    if (!hasSessionOverride) interceptMode = initialInterceptMode();
    updateStatus(ctx);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (interceptMode === "off") {
      return;
    }

    // ── Early short-circuit: model has native vision → zero cost ──
    // ctx.model.input is absolute truth from pi runtime. When it includes
    // "image", the model can see images natively. No need for atlas at all.
    // This check runs BEFORE any work (no status set, no image persist)
    // to guarantee zero overhead for vision-capable models.
    if (ctx.model?.input?.includes("image") && interceptMode !== "on") {
      return;
    }

    const mainModelRef = resolveMainModelRef(ctx.model);
    if (!mainModelRef) {
      return;
    }

    const temporaryImages = await persistTemporaryAttachedImages(event.images ?? []);
    const messageText = buildInterceptMessageText(event.prompt, temporaryImages.paths);
    // ── Runtime vision signal from pi SDK ──
    // ctx.model.input is ALWAYS an array per pi-ai Model type: ("text" | "image")[]
    //   ["text", "image"] → CERTAIN vision → true → skip intercept
    //   ["text"]          → CERTAIN text-only → false → intercept
    //   ctx.model undefined → UNKNOWN → undefined → heuristic/models.dev decides
    // This is correct for cursor-sdk bridge: Cursor models (composer-2.5, gpt-5.5, opus-4.8)
    // have input: ["text", "image"], while text-only models (deepseek) have input: ["text"].
    const runtimeSupportsVision = ctx.model?.input?.includes("image") ?? undefined;

    beginAnalysis(ctx);

    try {
      const result = await interceptImagesForTextModel(
        {
          mainModelRef,
          messageText,
          runtimeSupportsVision,
          env: process.env,
        },
        {
          forceIntercept: interceptMode === "on",
          skipIntercept: interceptMode === "off",
        },
        { cwd: ctx.cwd, signal: ctx.signal },
      );

      if (!result.intercepted || result.evidenceBlocks.length === 0) {
        return;
      }

      return {
        message: {
          customType: "atlas-vision-evidence",
          content: result.evidenceBlocks.join("\n\n"),
          display: false,
        },
      };
    } catch (error) {
      if (!ctx.signal?.aborted) {
        const message = error instanceof Error ? error.message : "Atlas vision intercept failed.";
        ctx.ui.notify(`Atlas vision intercept failed: ${message}`, "warning");
      }
      return;
    } finally {
      endAnalysis(ctx);
      try {
        await temporaryImages.cleanup();
      } catch (error) {
        const message = error instanceof Error ? error.message : "temporary image cleanup failed";
        ctx.ui.notify(`Atlas temporary image cleanup failed: ${message}`, "warning");
      }
    }
  });

  pi.on("tool_result", async (event, ctx) => {
    if (interceptMode === "off") {
      return;
    }

    // Native-vision short-circuit, same as before_agent_start: when the
    // model sees images natively the client attaches the image parts
    // itself, so there is nothing to intercept.
    if (ctx.model?.input?.includes("image") && interceptMode !== "on") {
      return;
    }

    if (
      !hasToolResultImageCandidate({
        toolName: event.toolName,
        toolInput: event.input,
        isError: event.isError,
        content: event.content,
      })
    ) {
      return;
    }

    const mainModelRef = resolveMainModelRef(ctx.model);
    if (!mainModelRef) {
      return;
    }

    beginAnalysis(ctx);

    try {
      const result = await interceptToolResultImage(
        {
          mainModelRef,
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          toolInput: event.input,
          content: event.content,
          isError: event.isError,
          runtimeSupportsVision: ctx.model?.input?.includes("image") ?? undefined,
          env: process.env,
          forceIntercept: interceptMode === "on",
        },
        { cwd: ctx.cwd, signal: ctx.signal },
      );

      if (!result.intercepted || !result.content) {
        return;
      }

      return { content: result.content };
    } catch (error) {
      if (!ctx.signal?.aborted) {
        const message =
          error instanceof Error ? error.message : "Atlas tool-result intercept failed.";
        ctx.ui.notify(`Atlas tool-result intercept failed: ${message}`, "warning");
      }
      return;
    } finally {
      endAnalysis(ctx);
    }
  });
}
