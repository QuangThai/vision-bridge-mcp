import { tmpdir } from "node:os";
import { basename, dirname, extname, join, normalize, resolve } from "node:path";
import {
  type ImageInterceptInput,
  type ImageInterceptOptions,
  type ModelsDevClientOptions,
  buildInjectedVisionContext,
  planImageIntercept,
} from "../capabilities/index.js";
import { type AtlasConfig, loadConfig } from "../config.js";
import type { FetchFn } from "../providers/types.js";
import { executeVisionCall } from "./execute-vision-call.js";

export interface InterceptImagesInput extends ImageInterceptInput {
  env?: NodeJS.ProcessEnv;
}

export interface InterceptImagesOptions extends ImageInterceptOptions {
  modelsDev?: ModelsDevClientOptions;
}

export interface InterceptImagesResult {
  messageText: string;
  intercepted: boolean;
  evidenceBlocks: string[];
  plan: Awaited<ReturnType<typeof planImageIntercept>>;
}

export interface InterceptImagesDependencies {
  cwd?: string;
  fetch?: FetchFn;
  loadConfig?: typeof loadConfig;
  plan?: typeof planImageIntercept;
  execute?: typeof executeVisionCall;
}

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".svg",
  ".heic",
  ".heif",
  ".tiff",
  ".tif",
]);

function pathInsideRoot(target: string, root: string): boolean {
  const normalizedTarget = normalize(target).replaceAll("\\", "/");
  const normalizedRoot = normalize(root).replaceAll("\\", "/");
  const targetKey =
    process.platform === "win32" ? normalizedTarget.toLowerCase() : normalizedTarget;
  const rootKey = process.platform === "win32" ? normalizedRoot.toLowerCase() : normalizedRoot;

  if (targetKey === rootKey) {
    return true;
  }

  const prefix = rootKey.endsWith("/") ? rootKey : `${rootKey}/`;
  return targetKey.startsWith(prefix);
}

function internalTempImageAllowedDir(imagePath: string): string | null {
  const absolutePath = normalize(resolve(imagePath));
  const tempRoot = normalize(resolve(tmpdir()));
  if (!pathInsideRoot(absolutePath, tempRoot)) {
    return null;
  }

  const extension = extname(absolutePath).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) {
    return null;
  }

  const fileName = basename(absolutePath).toLowerCase();
  if (fileName.startsWith("pi-clipboard-") || fileName.startsWith("atlas-clip-")) {
    return dirname(absolutePath);
  }

  const atlasTempRoot = normalize(join(tempRoot, "atlas-vision-mcp"));
  if (pathInsideRoot(absolutePath, atlasTempRoot) && /^attached-\d+\./u.test(fileName)) {
    return dirname(absolutePath);
  }

  return null;
}

function withAllowedInternalTempImage(config: AtlasConfig, imagePath: string): AtlasConfig {
  const allowedDir = internalTempImageAllowedDir(imagePath);
  if (!allowedDir || config.atlas.allowedDirs.includes(allowedDir)) {
    return config;
  }

  return {
    ...config,
    atlas: {
      ...config.atlas,
      allowedDirs: [...config.atlas.allowedDirs, allowedDir],
    },
  };
}

export async function interceptImagesForTextModel(
  input: InterceptImagesInput,
  options: InterceptImagesOptions = {},
  dependencies: InterceptImagesDependencies = {},
): Promise<InterceptImagesResult> {
  const planFn = dependencies.plan ?? planImageIntercept;
  const execute = dependencies.execute ?? executeVisionCall;
  const load = dependencies.loadConfig ?? loadConfig;

  const plan = await planFn(
    {
      mainModelRef: input.mainModelRef,
      providerId: input.providerId,
      messageText: input.messageText,
      runtimeSupportsVision: input.runtimeSupportsVision,
      env: input.env,
    },
    options,
    options.modelsDev ?? {},
  );

  if (!plan.shouldIntercept || plan.plannedCalls.length === 0) {
    return {
      messageText: input.messageText,
      intercepted: false,
      evidenceBlocks: [],
      plan,
    };
  }

  const config = load(input.env);
  const evidenceBlocks: string[] = [];

  for (const call of plan.plannedCalls) {
    const result = await execute(call, {
      config: withAllowedInternalTempImage(config, call.imagePath),
      cwd: dependencies.cwd,
      fetch: dependencies.fetch,
    });
    evidenceBlocks.push(buildInjectedVisionContext(result.imagePath, result.markdown));
  }

  return {
    intercepted: evidenceBlocks.length > 0,
    messageText: [input.messageText, ...evidenceBlocks].join("\n\n"),
    evidenceBlocks,
    plan,
  };
}
