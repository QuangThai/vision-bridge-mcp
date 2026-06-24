import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ImageError } from "../../src/image/errors.js";
import { assertWithinLimit, maxImageBytes } from "../../src/image/limits.js";
import { detectMimeType } from "../../src/image/mime.js";
import { readImageFromPath } from "../../src/image/read-image.js";

const FIXTURE_DIR = fileURLToPath(new URL("./fixtures", import.meta.url));

const MINIMAL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

let fixturePaths: {
  png: string;
  largePng: string;
  txt: string;
};

beforeAll(async () => {
  await mkdir(FIXTURE_DIR, { recursive: true });
  fixturePaths = {
    png: join(FIXTURE_DIR, "sample.png"),
    largePng: join(FIXTURE_DIR, "large.png"),
    txt: join(FIXTURE_DIR, "not-image.txt"),
  };

  await writeFile(fixturePaths.png, Buffer.from(MINIMAL_PNG_BASE64, "base64"));
  await writeFile(fixturePaths.txt, "not an image");
  await sharp({
    create: {
      width: 640,
      height: 480,
      channels: 3,
      background: { r: 20, g: 120, b: 200 },
    },
  })
    .png()
    .toFile(fixturePaths.largePng);
});

afterAll(async () => {
  // Fixtures remain in tests/fixtures for local inspection.
});

describe("mime detection", () => {
  it("detects png from buffer", () => {
    const buffer = Buffer.from(MINIMAL_PNG_BASE64, "base64");
    expect(detectMimeType(buffer, "ignored.gif")).toBe("image/png");
  });

  it("rejects unsupported formats", () => {
    expect(() => detectMimeType(Buffer.from("hello"), "file.txt")).toThrow(ImageError);
    expect(() => detectMimeType(Buffer.from("hello"), "file.txt")).toThrow(
      /Unsupported image format/,
    );
  });
});

describe("limits", () => {
  it("computes max bytes from mb", () => {
    expect(maxImageBytes(10)).toBe(10 * 1024 * 1024);
  });

  it("throws when over limit", () => {
    expect(() => assertWithinLimit(200, 0.00001)).toThrow(ImageError);
  });
});

describe("readImageFromPath", () => {
  it("reads png and returns base64 payload", async () => {
    const image = await readImageFromPath(basename(fixturePaths.png), {
      maxImageMb: 10,
      cwd: FIXTURE_DIR,
    });

    expect(image.mimeType).toBe("image/png");
    expect(image.base64.length).toBeGreaterThan(0);
    expect(image.sizeBytes).toBeGreaterThan(0);
    expect(image.resized).toBe(false);
    expect(image.width).toBe(1);
    expect(image.height).toBe(1);
  });

  it("throws not_found for missing files", async () => {
    await expect(
      readImageFromPath("missing.png", { maxImageMb: 10, cwd: FIXTURE_DIR, allowedDirs: ["."] }),
    ).rejects.toMatchObject({
      code: "not_found",
    } satisfies Partial<ImageError>);
  });

  it("throws path_not_allowed for paths outside allowed directories", async () => {
    await expect(
      readImageFromPath(join(FIXTURE_DIR, "../outside.png"), {
        maxImageMb: 10,
        cwd: FIXTURE_DIR,
        allowedDirs: ["."],
      }),
    ).rejects.toMatchObject({
      code: "path_not_allowed",
    } satisfies Partial<ImageError>);
  });

  it("throws unsupported_format for non-images", async () => {
    await expect(
      readImageFromPath(basename(fixturePaths.txt), { maxImageMb: 10, cwd: FIXTURE_DIR }),
    ).rejects.toMatchObject({
      code: "unsupported_format",
    });
  });

  it("resizes when image exceeds configured limit", async () => {
    const maxImageMb = 0.001;
    const image = await readImageFromPath(basename(fixturePaths.largePng), {
      maxImageMb,
      cwd: FIXTURE_DIR,
    });

    expect(image.resized).toBe(true);
    expect(image.sizeBytes).toBeLessThanOrEqual(maxImageBytes(maxImageMb));
    expect(image.base64.length).toBeGreaterThan(0);
  });

  it("throws too_large when image cannot be shrunk enough", async () => {
    await expect(
      readImageFromPath(basename(fixturePaths.largePng), {
        maxImageMb: 0.000001,
        cwd: FIXTURE_DIR,
      }),
    ).rejects.toMatchObject({
      code: "too_large",
    });
  });
});
