import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assertPathAllowed, PathPolicyError } from "../src/security/path-policy.js";

describe("assertPathAllowed", () => {
  const cwd = resolve("/workspace/project");

  it("allows paths inside an allowed relative directory", () => {
    const result = assertPathAllowed("./screenshots/a.png", {
      cwd,
      allowedDirs: ["."],
    });

    expect(result.absolutePath).toBe(resolve(cwd, "screenshots/a.png"));
  });

  it("allows absolute paths inside an allowed absolute root", () => {
    const result = assertPathAllowed("/workspace/project/assets/a.png", {
      cwd,
      allowedDirs: ["/workspace/project/assets"],
    });

    expect(result.absolutePath).toBe(resolve("/workspace/project/assets/a.png"));
  });

  it("rejects paths outside allowed directories with cwd context", () => {
    expect(() =>
      assertPathAllowed("/etc/passwd", {
        cwd,
        allowedDirs: ["."],
      }),
    ).toThrow(PathPolicyError);

    try {
      assertPathAllowed("/etc/passwd", {
        cwd,
        allowedDirs: ["."],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(PathPolicyError);
      const policyError = error as PathPolicyError;
      expect(policyError.message).toContain("outside allowed directories");
      expect(policyError.message).toContain(`Current working directory: ${cwd}`);
      expect(policyError.message).toContain("Allowed directories: .");
    }
  });

  it("rejects traversal outside the allowed root", () => {
    expect(() =>
      assertPathAllowed("../../outside.png", {
        cwd: resolve("/workspace/project/app"),
        allowedDirs: ["."],
      }),
    ).toThrow(PathPolicyError);
  });
});
