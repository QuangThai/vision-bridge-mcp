import {
  type ImageInterceptInput,
  type ImageInterceptOptions,
  type ModelsDevClientOptions,
  buildInjectedVisionContext,
  planImageIntercept,
} from "../capabilities/index.js";
import { loadConfig } from "../config.js";
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
      config,
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
