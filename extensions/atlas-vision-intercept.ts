import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  buildInterceptMessageText,
  interceptImagesForTextModel,
  persistAttachedImages,
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

function resolveMainModelRef(model: { provider: string; id: string } | undefined): string | null {
  const override = process.env.MAIN_MODEL_REF?.trim();
  if (override) {
    return override;
  }

  if (!model) {
    return null;
  }

  return `${model.provider}/${model.id}`;
}

export default function atlasVisionInterceptExtension(pi: ExtensionAPI) {
  // Load env on startup — no manual export needed.
  // User's existing process.env always takes priority.
  loadAtlasEnvFiles(process.cwd());

  pi.on("session_start", (_event, ctx) => {
    // Re-check with session cwd (e.g. if pi was started in a different directory)
    loadAtlasEnvFiles(ctx.cwd);

    if (envFlag("ATLAS_SKIP_INTERCEPT")) {
      return;
    }

    ctx.ui.setStatus(
      "atlas-vision",
      envFlag("ATLAS_FORCE_INTERCEPT") ? "atlas: force intercept" : "atlas: auto intercept",
    );
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (envFlag("ATLAS_SKIP_INTERCEPT")) {
      return;
    }

    // ── Early short-circuit: model has native vision → zero cost ──
    // ctx.model.input is absolute truth from pi runtime. When it includes
    // "image", the model can see images natively. No need for atlas at all.
    // This check runs BEFORE any work (no status set, no image persist)
    // to guarantee zero overhead for vision-capable models.
    if (ctx.model?.input?.includes("image") && !envFlag("ATLAS_FORCE_INTERCEPT")) {
      return;
    }

    const mainModelRef = resolveMainModelRef(ctx.model);
    if (!mainModelRef) {
      return;
    }

    const attachedPaths = await persistAttachedImages(
      event.images,
      ctx.sessionManager.getLeafId() ?? "session",
    );
    const messageText = buildInterceptMessageText(event.prompt, attachedPaths);
    // ── Runtime vision signal from pi SDK ──
    // ctx.model.input is ALWAYS an array per pi-ai Model type: ("text" | "image")[]
    //   ["text", "image"] → CERTAIN vision → true → skip intercept
    //   ["text"]          → CERTAIN text-only → false → intercept
    //   ctx.model undefined → UNKNOWN → undefined → heuristic/models.dev decides
    // This is correct for cursor-sdk bridge: Cursor models (composer-2.5, gpt-5.5, opus-4.8)
    // have input: ["text", "image"], while text-only models (deepseek) have input: ["text"].
    const runtimeSupportsVision = ctx.model?.input?.includes("image") ?? undefined;

    ctx.ui.setStatus("atlas-vision", "atlas: analyzing image(s)...");

    try {
      const result = await interceptImagesForTextModel(
        {
          mainModelRef,
          messageText,
          runtimeSupportsVision,
          env: process.env,
        },
        {
          forceIntercept: envFlag("ATLAS_FORCE_INTERCEPT"),
          skipIntercept: envFlag("ATLAS_SKIP_INTERCEPT"),
        },
        { cwd: ctx.cwd },
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
      const message = error instanceof Error ? error.message : "Atlas vision intercept failed.";
      ctx.ui.notify(`Atlas vision intercept failed: ${message}`, "warning");
      return;
    } finally {
      ctx.ui.setStatus("atlas-vision", undefined);
    }
  });
}
