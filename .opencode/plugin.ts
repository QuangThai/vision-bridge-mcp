/**
 * Atlas Vision — OpenCode Plugin
 *
 * Auto-intercept images for text-only models (DeepSeek, GLM, etc.).
 * No MCP tool calls needed — images are analyzed and injected as text
 * before the model sees them.
 *
 * ## Setup
 *
 * 1. Copy to ~/.config/opencode/plugins/atlas-vision.ts:
 *    mkdir -p ~/.config/opencode/plugins
 *    cp .opencode/plugin.ts ~/.config/opencode/plugins/atlas-vision.ts
 *
 * 2. Add to ~/.config/opencode/opencode.json:
 *    {
 *      "plugin": ["file:///Users/you/.config/opencode/plugins/atlas-vision.ts"]
 *    }
 *
 * 3. Set env vars (in shell or opencode.json env):
 *    VISION_API_KEY=your_key
 *    VISION_BASE_URL=https://api.openai.com/v1
 *    VISION_MODEL=gpt-4o-mini
 *
 * ## How it works
 *
 * 1. User sends a message with an image (paste, upload, or path)
 * 2. `chat.message` hook fires BEFORE the LLM sees the message
 * 3. Plugin detects image parts, sends them to the vision API
 * 4. Image parts are replaced with text analysis
 * 5. Text-only model receives clean text — no errors
 */

import type { Plugin } from "@opencode-ai/plugin";

// ── Config ──────────────────────────────────────────────
function getConfig() {
  return {
    baseUrl: process.env.VISION_BASE_URL?.replace(/\/+$/, "") || "https://api.openai.com/v1",
    apiKey: process.env.VISION_API_KEY || "",
    model: process.env.VISION_MODEL || "gpt-4o-mini",
    maxTokens: Number.parseInt(process.env.VISION_MAX_TOKENS || "1024", 10),
    maxImageMB: Number.parseInt(process.env.VISION_MAX_IMAGE_MB || "20", 10),
    enabled: process.env.VISION_PLUGIN_DISABLED !== "1",
    systemPrompt:
      process.env.VISION_PLUGIN_PROMPT ||
      "Describe this image in detail. Include all visible text, UI elements, layout structure, and any notable visual features. Be specific and objective.",
  };
}

// ── Vision API call ─────────────────────────────────────
interface VisionResult {
  content: string;
  error?: string;
}

async function analyzeImage(base64Data: string, mimeType: string): Promise<VisionResult> {
  const config = getConfig();

  if (!config.apiKey) {
    return { content: "", error: "VISION_API_KEY not set" };
  }

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: config.systemPrompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Data}`,
                  detail: "auto",
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "unknown");
      return {
        content: "",
        error: `Vision API error ${response.status}: ${errBody.slice(0, 200)}`,
      };
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      return { content: "", error: "Vision API returned empty response" };
    }

    return { content: text };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: "", error: `Vision API call failed: ${message}` };
  }
}

// ── Image detection helpers ────────────────────────────
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);

function hasImageExtension(path: string): boolean {
  const lower = path.toLowerCase();
  for (const ext of IMAGE_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

function looksLikeImagePath(text: string): boolean {
  // Match file paths or URLs with image extensions
  return /\.(png|jpg|jpeg|gif|webp|bmp)(\?.*)?$/i.test(text.trim());
}

// ── File reading ────────────────────────────────────────
async function readFileAsBase64(filePath: string): Promise<{ data: string; mime: string } | null> {
  try {
    const fs = await import("node:fs/promises");
    const buffer = await fs.readFile(filePath);
    const ext = filePath.toLowerCase().slice(filePath.lastIndexOf("."));
    const mimeMap: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".bmp": "image/bmp",
    };
    return {
      data: buffer.toString("base64"),
      mime: mimeMap[ext] || "image/png",
    };
  } catch {
    return null;
  }
}

// ── Plugin exports ──────────────────────────────────────
const AtlasVisionPlugin: Plugin = async () => {
  return {
    /**
     * Intercept user messages before they reach the LLM.
     * Detect image parts, analyze via vision API, replace with text.
     */
    "chat.message": async (_input, output) => {
      const config = getConfig();
      if (!config.enabled) return;

      const parts = output.parts;
      if (!parts || parts.length === 0) return;

      // Collect image parts and text references to images
      const imageParts: Array<{ index: number; data: string; mime: string }> = [];
      const textRefs: Array<{ text: string }> = [];

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i] as Record<string, unknown>;

        // Type 1: file part with image
        if (part.type === "file") {
          const file = part.file as Record<string, unknown> | undefined;
          if (file) {
            const path = file.path as string | undefined;
            const content = file.content as string | undefined;

            if (path && hasImageExtension(path)) {
              const mime = `image/${path.toLowerCase().slice(path.lastIndexOf(".") + 1)}`;
              if (content) {
                imageParts.push({ index: i, data: content, mime });
              } else {
                // Read from disk
                const result = await readFileAsBase64(path);
                if (result) {
                  imageParts.push({ index: i, data: result.data, mime: result.mime });
                }
              }
            }
          }
        }

        // Type 2: text part mentioning image paths
        if (part.type === "text") {
          const text = (part.text as string) || "";
          // Find image path references like ./shot.png or ![alt](path)
          const refRegex = /[\w./\\-]+\.(png|jpg|jpeg|gif|webp|bmp)/gi;
          for (const refMatch of text.matchAll(refRegex)) {
            textRefs.push({ text: refMatch[0] });
          }
          // Markdown images: ![alt](path)
          const mdRegex = /!\[.*?\]\(([^)]+)\)/g;
          for (const mdMatch of text.matchAll(mdRegex)) {
            textRefs.push({ text: mdMatch[1] });
          }
        }
      }

      // Analyze images
      const analysisTexts: string[] = [];

      for (const img of imageParts) {
        const result = await analyzeImage(img.data, img.mime);
        if (result.content) {
          analysisTexts.push(result.content);
        }
      }

      // If no image parts but text refs, try reading from file system
      if (imageParts.length === 0 && textRefs.length > 0) {
        for (const ref of textRefs) {
          const result = await readFileAsBase64(ref.text);
          if (result) {
            const vision = await analyzeImage(result.data, result.mime);
            if (vision.content) {
              analysisTexts.push(vision.content);
            }
          }
        }
      }

      if (analysisTexts.length === 0) return;

      // Build injected text
      const evidenceText = `<atlas-vision-evidence>\n${analysisTexts.join("\n\n---\n\n")}\n</atlas-vision-evidence>\n\nUse the Atlas vision evidence above as visual context.`;

      // Replace image parts with analysis text parts
      const newParts: Array<Record<string, unknown>> = [];
      const replacedIndices = new Set(imageParts.map((p) => p.index));

      for (let i = 0; i < parts.length; i++) {
        if (replacedIndices.has(i)) {
          // Replace image part with analysis text
          newParts.push({
            type: "text",
            text: evidenceText,
          });
        } else {
          newParts.push(parts[i] as Record<string, unknown>);
        }
      }

      output.parts = newParts as typeof output.parts;
    },

    /**
     * Register tools for explicit vision calls.
     */
    tool: {
      vision: {
        name: "vision",
        description: "Analyze an image and return a text description",
        parameters: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "The analysis instruction" },
          },
          required: ["prompt"],
        },
      },
      vision_text: {
        name: "vision_text",
        description: "Get the last analyzed image description as text",
        parameters: {
          type: "object",
          properties: {},
        },
      },
    },
  };
};

export default AtlasVisionPlugin;
