import { describe, expect, it } from "vitest";
import {
  buildInterceptMessageText,
  collectImagePathsFromPrompt,
} from "../../src/harness/attached-images.js";

describe("attached-images helpers", () => {
  it("adds attached image paths to intercept message text", () => {
    const text = buildInterceptMessageText("fix this ui", ["/tmp/shot.png"]);
    expect(text).toContain("fix this ui");
    expect(text).toContain("Attached image: /tmp/shot.png");
  });

  it("deduplicates prompt and attached image paths", () => {
    const paths = collectImagePathsFromPrompt("see ./shot.png", ["./shot.png", "/tmp/b.png"]);
    expect(paths).toEqual(["./shot.png", "/tmp/b.png"]);
  });
});
