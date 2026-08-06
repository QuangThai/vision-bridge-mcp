import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PathPolicyError, assertPathAllowed } from "../src/security/path-policy.js";

const tempBases: string[] = [];

afterEach(() => {
  for (const base of tempBases.splice(0)) {
    rmSync(base, { recursive: true, force: true });
  }
});

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

  it("allows paths inside a symlinked allowed directory", async () => {
    // Regression: on macOS /tmp and /var are symlinks to /private/tmp and
    // /private/var. The image path is realpath'd before the prefix check,
    // so an allowed root that is itself a symlink must be realpath'd too,
    // otherwise every image under it is rejected.
    const base = mkdtempSync(join(tmpdir(), "atlas-allowed-"));
    tempBases.push(base);
    const realDir = join(base, "real");
    const linkDir = join(base, "link");
    mkdirSync(realDir);
    symlinkSync(realDir, linkDir, "dir");
    const imagePath = join(linkDir, "shot.png");
    writeFileSync(imagePath, "x");

    const result = await assertPathAllowed(imagePath, {
      cwd: base,
      allowedDirs: [linkDir],
    });

    expect(result.absolutePath).toBe(realpathSync(imagePath));
  });

  it("rejects paths when the allowed root is a symlink pointing outside", async () => {
    // The image resolves (through the symlink) to the real directory, so it
    // is still inside the realpath'd root; a file that is not under the
    // real directory must be rejected.
    const base = mkdtempSync(join(tmpdir(), "atlas-allowed-"));
    tempBases.push(base);
    const realDir = join(base, "real");
    const linkDir = join(base, "link");
    const outside = join(base, "outside.png");
    mkdirSync(realDir);
    symlinkSync(realDir, linkDir, "dir");
    writeFileSync(outside, "x");

    await expect(
      assertPathAllowed(outside, {
        cwd: base,
        allowedDirs: [linkDir],
      }),
    ).rejects.toThrow(PathPolicyError);
  });

  it("rejects paths when an allowed root does not exist", async () => {
    // realpath() fails for a missing root; the resolver must fall back to
    // the plain path instead of throwing.
    await expect(
      assertPathAllowed("/etc/passwd", {
        cwd,
        allowedDirs: ["/nonexistent-allowed-root-xyz"],
      }),
    ).rejects.toThrow(PathPolicyError);
  });
});
