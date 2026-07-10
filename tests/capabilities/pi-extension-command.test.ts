import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import atlasVisionInterceptExtension from "../../extensions/atlas-vision-intercept.js";

type AtlasCommand = {
  handler: (args: string, ctx: CommandContext) => Promise<void> | void;
};

type CommandContext = {
  ui: {
    notify: (message: string, level: "info" | "warning" | "error") => void;
    setStatus: (key: string, value: string | undefined) => void;
  };
};

type BeforeAgentStartHandler = (
  event: { images: never[]; prompt: string },
  ctx: {
    model: { provider: string; id: string; input: string[] };
    sessionManager: { getLeafId: () => string };
    ui: CommandContext["ui"];
    cwd: string;
  },
) => Promise<unknown>;

const initialSkipIntercept = process.env.ATLAS_SKIP_INTERCEPT;
const initialForceIntercept = process.env.ATLAS_FORCE_INTERCEPT;

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, name);
  } else {
    process.env[name] = value;
  }
}

describe("Pi Atlas intercept command", () => {
  beforeEach(() => {
    process.env.ATLAS_SKIP_INTERCEPT = "";
    process.env.ATLAS_FORCE_INTERCEPT = "";
  });

  afterEach(() => {
    restoreEnv("ATLAS_SKIP_INTERCEPT", initialSkipIntercept);
    restoreEnv("ATLAS_FORCE_INTERCEPT", initialForceIntercept);
  });

  it("disables and restores automatic interception for the current Pi session", async () => {
    const commands = new Map<string, AtlasCommand>();
    const handlers = new Map<string, BeforeAgentStartHandler>();
    const notices: string[] = [];

    atlasVisionInterceptExtension({
      on: (event: string, handler: BeforeAgentStartHandler) => {
        handlers.set(event, handler);
      },
      registerCommand: (name: string, command: AtlasCommand) => {
        commands.set(name, command);
      },
    } as unknown as ExtensionAPI);

    const atlas = commands.get("atlas");
    expect(atlas).toBeDefined();

    const ctx: CommandContext = {
      ui: {
        notify: (message) => notices.push(message),
        setStatus: () => undefined,
      },
    };

    await atlas?.handler("on", ctx);
    expect(notices.at(-1)).toContain("forced on");

    await atlas?.handler("status", ctx);
    expect(notices.at(-1)).toContain("on");

    await atlas?.handler("off", ctx);
    expect(notices.at(-1)).toContain("disabled");

    const beforeAgentStart = handlers.get("before_agent_start");
    expect(beforeAgentStart).toBeDefined();
    if (!beforeAgentStart) throw new Error("Atlas before_agent_start handler was not registered.");

    const result = await beforeAgentStart(
      { images: [], prompt: "Analyze the attached image" },
      {
        model: { provider: "deepseek", id: "deepseek-v4-flash", input: ["text"] },
        sessionManager: { getLeafId: () => "session" },
        ui: ctx.ui,
        cwd: process.cwd(),
      },
    );
    expect(result).toBeUndefined();

    await atlas?.handler("auto", ctx);
    expect(notices.at(-1)).toContain("automatic");
  });
});
