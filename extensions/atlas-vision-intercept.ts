import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  buildInterceptMessageText,
  interceptImagesForTextModel,
  persistAttachedImages,
} from "../dist/index.js";

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
  pi.on("session_start", (_event, ctx) => {
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

    const mainModelRef = resolveMainModelRef(ctx.model);
    if (!mainModelRef) {
      return;
    }

    const attachedPaths = await persistAttachedImages(
      event.images,
      ctx.sessionManager.getLeafId() ?? "session",
    );
    const messageText = buildInterceptMessageText(event.prompt, attachedPaths);
    const runtimeSupportsVision = ctx.model?.input.includes("image") ?? false;

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
