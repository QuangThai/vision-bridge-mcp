import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli/run.js";
import { PACKAGE_NAME, VERSION } from "../src/index.js";

describe("package skeleton", () => {
  it("exports package metadata", () => {
    expect(PACKAGE_NAME).toBe("atlas-vision-mcp");
    expect(VERSION).toBe("0.10.0");
  });

  it("prints help without exiting", () => {
    const code = runCli(["--help"]);
    expect(code).toBe(0);
  });
});
