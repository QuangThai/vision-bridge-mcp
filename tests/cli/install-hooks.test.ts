import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mergeHookConfig } from "../../src/cli/install-hooks-commands.js";

// ---------------------------------------------------------------------------
// Since install-hooks writes to real home dir paths, we test the merge logic
// directly and verify the function signature works.
// ---------------------------------------------------------------------------

describe("mergeHookConfig", () => {
  it("adds atlas hooks when config file is empty", () => {
    const existing = {};
    const atlas = {
      version: 1,
      hooks: {
        beforeSubmitPrompt: [{ command: "npx atlas-vision hook" }],
      },
    };

    const merged = mergeHookConfig(existing, atlas);
    expect(merged).toEqual(atlas);
  });

  it("adds atlas hooks when config has unrelated entries", () => {
    const existing = { version: 1, otherHook: { foo: "bar" } };
    const atlas = {
      hooks: {
        beforeSubmitPrompt: [{ command: "npx atlas-vision hook" }],
      },
    };

    const merged = mergeHookConfig(existing, atlas);
    expect(merged.version).toBe(1);
    expect(merged.otherHook).toEqual({ foo: "bar" });
    expect(merged.hooks).toEqual(atlas.hooks);
  });

  it("preserves existing hooks when adding atlas hooks", () => {
    const existing = {
      version: 1,
      hooks: {
        beforeSubmitPrompt: [{ command: "existing-hook" }],
      },
    };
    const atlas = {
      hooks: {
        beforeSubmitPrompt: [{ command: "atlas-vision hook" }],
      },
    };

    const merged = mergeHookConfig(existing, atlas);
    expect(merged.version).toBe(1);
    // biome-ignore lint/suspicious/noExplicitAny: test type narrowing
    expect((merged.hooks as any).beforeSubmitPrompt).toHaveLength(2);
  });

  it("does not duplicate existing atlas hooks", () => {
    const atlasEntry = { command: "npx atlas-vision hook" };
    const existing = {
      hooks: {
        beforeSubmitPrompt: [atlasEntry],
      },
    };
    const atlas = {
      hooks: {
        beforeSubmitPrompt: [atlasEntry],
      },
    };

    const merged = mergeHookConfig(existing, atlas);
    // biome-ignore lint/suspicious/noExplicitAny: test type narrowing
    expect((merged.hooks as any).beforeSubmitPrompt).toHaveLength(1);
  });

  it("deep merges nested hook structures for Claude/Codex format", () => {
    const existing = {
      hooks: {
        UserPromptSubmit: [
          {
            hooks: [{ type: "command", command: "existing-script", timeout: 30 }],
          },
        ],
      },
    };
    const atlas = {
      hooks: {
        UserPromptSubmit: [
          {
            hooks: [{ type: "command", command: "atlas-vision hook", timeout: 120 }],
          },
        ],
      },
    };

    const merged = mergeHookConfig(existing, atlas);
    // Merge appends at UserPromptSubmit array level (not inner hooks level)
    // biome-ignore lint/suspicious/noExplicitAny: test type narrowing
    const entries = (merged.hooks as any).UserPromptSubmit;
    expect(entries).toHaveLength(2);
    expect(entries[0].hooks[0].command).toBe("existing-script");
    expect(entries[1].hooks[0].command).toBe("atlas-vision hook");
  });

  it("returns original when atlas entry is empty", () => {
    const existing = { key: "value" };
    const merged = mergeHookConfig(existing, {});
    expect(merged).toEqual({ key: "value" });
  });
});
