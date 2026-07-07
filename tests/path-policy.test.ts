import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PathPolicyError, assertPathAllowed } from "../src/security/path-policy.js";

describe("assertPathAllowed", () => {
  const cwd = resolve("/workspace/project");

  it("allows paths inside an allowed relative directory", async () => {
    const result = await assertPathAllowed("./screenshots/a.png", {
      cwd,
      allowedDirs: ["."],
    });

    expect(result.absolutePath).toBe(resolve(cwd, "screenshots/a.png"));
  });

  it("allows absolute paths inside an allowed absolute root", async () => {
    const result = await assertPathAllowed("/workspace/project/assets/a.png", {
      cwd,
      allowedDirs: ["/workspace/project/assets"],
    });

    expect(result.absolutePath).toBe(resolve("/workspace/project/assets/a.png"));
  });

  it("rejects paths outside allowed directories with cwd context", async () => {
    await expect(
      assertPathAllowed("/etc/passwd", {
        cwd,
        allowedDirs: ["."],
      }),
    ).rejects.toThrow(PathPolicyError);

    try {
      await assertPathAllowed("/etc/passwd", {
        cwd,
        allowedDirs: ["."],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(PathPolicyError);
      const policyError = error as PathPolicyError;
      expect(policyError.message).toContain("outside allowed directories");
    }
  });

  it("rejects traversal outside the allowed root", async () => {
    await expect(
      assertPathAllowed("../../outside.png", {
        cwd: resolve("/workspace/project/app"),
        allowedDirs: ["."],
      }),
    ).rejects.toThrow(PathPolicyError);
  });
});
