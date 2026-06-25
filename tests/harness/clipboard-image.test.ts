import { describe, expect, it } from "vitest";
import {
  getClipboardDetectMode,
  shouldAutoDetectClipboard,
} from "../../src/harness/clipboard-image.js";

// ---------------------------------------------------------------------------
// getClipboardDetectMode
// ---------------------------------------------------------------------------

describe("getClipboardDetectMode()", () => {
  it('returns "off" when env var is not set', () => {
    expect(getClipboardDetectMode({})).toBe("off");
  });

  it('returns "off" for unrecognised values', () => {
    expect(getClipboardDetectMode({ ATLAS_CLIPBOARD_DETECT: "no" })).toBe("off");
    expect(getClipboardDetectMode({ ATLAS_CLIPBOARD_DETECT: "0" })).toBe("off");
    expect(getClipboardDetectMode({ ATLAS_CLIPBOARD_DETECT: "false" })).toBe("off");
    expect(getClipboardDetectMode({ ATLAS_CLIPBOARD_DETECT: "disabled" })).toBe("off");
  });

  it('returns "always" for truthy values', () => {
    expect(getClipboardDetectMode({ ATLAS_CLIPBOARD_DETECT: "1" })).toBe("always");
    expect(getClipboardDetectMode({ ATLAS_CLIPBOARD_DETECT: "true" })).toBe("always");
    expect(getClipboardDetectMode({ ATLAS_CLIPBOARD_DETECT: "yes" })).toBe("always");
    expect(getClipboardDetectMode({ ATLAS_CLIPBOARD_DETECT: "always" })).toBe("always");
  });

  it('returns "smart" for keyword-triggered modes', () => {
    expect(getClipboardDetectMode({ ATLAS_CLIPBOARD_DETECT: "smart" })).toBe("smart");
    expect(getClipboardDetectMode({ ATLAS_CLIPBOARD_DETECT: "auto" })).toBe("smart");
    expect(getClipboardDetectMode({ ATLAS_CLIPBOARD_DETECT: "1-smart" })).toBe("smart");
  });

  it("is case-insensitive", () => {
    expect(getClipboardDetectMode({ ATLAS_CLIPBOARD_DETECT: "SMART" })).toBe("smart");
    expect(getClipboardDetectMode({ ATLAS_CLIPBOARD_DETECT: "Always" })).toBe("always");
    expect(getClipboardDetectMode({ ATLAS_CLIPBOARD_DETECT: "TRUE" })).toBe("always");
  });

  it("trims whitespace", () => {
    expect(getClipboardDetectMode({ ATLAS_CLIPBOARD_DETECT: "  smart  " })).toBe("smart");
  });
});

// ---------------------------------------------------------------------------
// shouldAutoDetectClipboard
// ---------------------------------------------------------------------------

describe("shouldAutoDetectClipboard()", () => {
  it("returns false when ATLAS_CLIPBOARD_DETECT is not set", () => {
    expect(shouldAutoDetectClipboard("test prompt", {})).toBe(false);
  });

  it("returns true when mode is 'always' regardless of prompt", () => {
    const env = { ATLAS_CLIPBOARD_DETECT: "always" };
    expect(shouldAutoDetectClipboard("", env)).toBe(true);
    expect(shouldAutoDetectClipboard("hello world", env)).toBe(true);
    expect(shouldAutoDetectClipboard("nothing about images here", env)).toBe(true);
  });

  describe("smart mode", () => {
    const env = { ATLAS_CLIPBOARD_DETECT: "smart" };

    it("returns false for empty prompt", () => {
      expect(shouldAutoDetectClipboard("", env)).toBe(false);
    });

    it("returns false for non-image prompts", () => {
      const prompts = [
        "write a function to calculate fibonacci",
        "what is the weather like?",
        "refactor this code to use async/await",
        "hello world",
        "explain the architecture",
      ];
      for (const p of prompts) {
        expect(shouldAutoDetectClipboard(p, env)).toBe(false);
      }
    });

    // -- Vietnamese keywords --

    it("detects 'ảnh' keyword", () => {
      expect(shouldAutoDetectClipboard("phân tích ảnh này", env)).toBe(true);
      expect(shouldAutoDetectClipboard("nội dung của ảnh là gì", env)).toBe(true);
    });

    it("detects 'hình' keyword", () => {
      expect(shouldAutoDetectClipboard("hình này chụp gì", env)).toBe(true);
      expect(shouldAutoDetectClipboard("xem hình giúp tôi", env)).toBe(true);
    });

    it("detects 'screenshot' keyword", () => {
      expect(shouldAutoDetectClipboard("chụp screenshot màn hình", env)).toBe(true);
      expect(shouldAutoDetectClipboard("screenshot error log", env)).toBe(true);
    });

    it("detects 'clipboard' keyword", () => {
      expect(shouldAutoDetectClipboard("clipboard có gì", env)).toBe(true);
      expect(shouldAutoDetectClipboard("xem clipboard image", env)).toBe(true);
    });

    it("detects 'phân tích' + 'ảnh' pattern", () => {
      expect(shouldAutoDetectClipboard("phân tích ảnh này giúp tôi", env)).toBe(true);
      expect(shouldAutoDetectClipboard("phân tích hình ảnh", env)).toBe(true);
    });

    it("detects 'đọc' + image pattern", () => {
      expect(shouldAutoDetectClipboard("đọc chữ trong ảnh", env)).toBe(true);
      expect(shouldAutoDetectClipboard("đọc nội dung hình", env)).toBe(true);
    });

    // -- English keywords --

    it("detects 'image' keyword", () => {
      expect(shouldAutoDetectClipboard("what is this image", env)).toBe(true);
      expect(shouldAutoDetectClipboard("describe this image", env)).toBe(true);
    });

    it("detects 'picture' keyword", () => {
      expect(shouldAutoDetectClipboard("analyze this picture", env)).toBe(true);
      expect(shouldAutoDetectClipboard("what's in this picture", env)).toBe(true);
    });

    it("detects 'screenshot' keyword (english)", () => {
      expect(shouldAutoDetectClipboard("take a screenshot and describe", env)).toBe(true);
      expect(shouldAutoDetectClipboard("screenshot of error", env)).toBe(true);
    });

    it("detects 'describe ... screen' pattern", () => {
      expect(shouldAutoDetectClipboard("describe this screen", env)).toBe(true);
      expect(shouldAutoDetectClipboard("what is on my screen", env)).toBe(true);
    });

    it("detects 'ocr' keyword", () => {
      expect(shouldAutoDetectClipboard("perform ocr on this", env)).toBe(true);
    });

    it("detects 'this picture' pattern", () => {
      expect(shouldAutoDetectClipboard("what's in this picture", env)).toBe(true);
      expect(shouldAutoDetectClipboard("this image right here", env)).toBe(true);
    });
  });

  it("returns false for smart mode + non-matching prompt", () => {
    const env = { ATLAS_CLIPBOARD_DETECT: "smart" };
    expect(shouldAutoDetectClipboard("write unit tests for this module", env)).toBe(false);
    expect(shouldAutoDetectClipboard("refactor the main controller", env)).toBe(false);
  });
});
