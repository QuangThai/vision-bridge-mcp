/**
 * clipboard-image.ts — Auto-detect clipboard image for Atlas vision intercept.
 *
 * When Droid/OpenCode native image attachments are unavailable to text-only
 * models, the Atlas hook/tool can read the OS clipboard image directly and feed
 * it through the vision pipeline.
 *
 * Triggered by:
 *  - Env var ATLAS_CLIPBOARD_DETECT=true (always) / "smart" (keyword-based)
 *  - Prompt contains image-related keywords (smart mode)
 */

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Env var that controls clipboard auto-detection behaviour. */
export const ENV_CLIPBOARD_DETECT = "ATLAS_CLIPBOARD_DETECT" as const;

/**
 * Prompt keywords that hint the user is referring to an image on the
 * clipboard.  Used in "smart" mode only.
 *
 * NOTE: JavaScript `\b` word boundary does NOT work with Vietnamese
 * Unicode characters (e.g. `ả`, `ậ`, `ị`) because they are outside
 * the `\w` set.  We use explicit word separators instead for all
 * patterns to stay consistent.
 */

/**
 * Word-start boundary — must be preceded by start-of-string or a non-word
 * separator character.  Works with Unicode characters (unlike `\b`).
 */
const WORD_B = "(?:^|[\\s,.;:!?(){}'\"`/@#~])";

/**
 * Word-end boundary — must be followed by end-of-string or a non-word
 * separator character.  Works with Unicode characters (unlike `\b`).
 */
const WORD_E = "(?:$|[\\s,.;:!?(){}'\"`/@#~])";

/** Capture any character (including 0) before the trailing boundary. */
const ANY = "[\\s\\S]*?";

const IMAGE_KEYWORD_PATTERNS: readonly RegExp[] = [
  // ---------- Vietnamese single-word triggers ----------
  new RegExp(`${WORD_B}ảnh${WORD_E}`, "iu"),
  new RegExp(`${WORD_B}hình${WORD_E}`, "iu"),
  new RegExp(`${WORD_B}screenshot${WORD_E}`, "iu"),
  new RegExp(`${WORD_B}clipboard${WORD_E}`, "iu"),
  /nhận dạng/iu,
  /bảng tạm/iu,
  /chụp màn hình/iu,

  // ---------- Vietnamese multi-word patterns ----------
  // phâN tích + image word (in either order)
  new RegExp(`phân tích${ANY}ảnh`, "iu"),
  // ảnh + này/kia/đó
  new RegExp(`${WORD_B}ảnh(?:${ANY}(?:này|kia|đó))?${WORD_E}`, "iu"),
  // đọc + ảnh/hình
  new RegExp(`đọc${ANY}ảnh`, "iu"),

  // ---------- English single-word triggers ----------
  new RegExp(`${WORD_B}image${WORD_E}`, "iu"),
  new RegExp(`${WORD_B}picture${WORD_E}`, "iu"),
  new RegExp(`${WORD_B}photo${WORD_E}`, "iu"),
  new RegExp(`${WORD_B}snapshot${WORD_E}`, "iu"),
  new RegExp(`${WORD_B}screen(?:shot)?${WORD_E}`, "iu"),
  new RegExp(`${WORD_B}ocr${WORD_E}`, "iu"),

  // ---------- English multi-word patterns ----------
  // capture + screen
  new RegExp(`capture${ANY}screen`, "iu"),
  // describe + image-type word (after describe)
  new RegExp(`describe${ANY}(?:image|picture|photo|screen)`, "iu"),
  // what(’s| is) in/on + image-type word
  new RegExp(`what(?:’s| is)${ANY}in${ANY}(?:image|picture|photo|screen)`, "iu"),
  // read + text/content
  new RegExp(`read${ANY}(?:text|character)`, "iu"),
  // this + image-type word
  new RegExp(`this${ANY}(?:image|picture|photo)`, "iu"),
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read power of the clipboard image detection env var.
 *
 * @returns "always" | "smart" | "off"
 */
export function getClipboardDetectMode(env: NodeJS.ProcessEnv): "always" | "smart" | "off" {
  const raw = env[ENV_CLIPBOARD_DETECT]?.trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "always") {
    return "always";
  }
  if (raw === "smart" || raw === "auto" || raw === "1-smart") {
    return "smart";
  }
  return "off";
}

/**
 * Determine whether the clipboard should be checked for an image before
 * sending the prompt to the model.
 *
 * @param prompt  The user-submitted prompt text.
 * @param env     Environment variables (checked for ATLAS_CLIPBOARD_DETECT).
 * @returns       `true` if clipboard should be inspected.
 */
export function shouldAutoDetectClipboard(prompt: string, env: NodeJS.ProcessEnv): boolean {
  const mode = getClipboardDetectMode(env);
  if (mode === "always") {
    return true;
  }
  if (mode === "smart") {
    if (!prompt) return false;
    const lower = prompt.toLowerCase();
    return IMAGE_KEYWORD_PATTERNS.some((re) => re.test(lower));
  }
  return false;
}

/**
 * Read the current OS clipboard image and save it to a temporary image file.
 *
 * Platform support:
 * - Windows: built-in PowerShell Desktop `Get-Clipboard -Format Image`.
 * - macOS: `pngpaste` when installed, with AppleScript clipboard fallback.
 * - Linux: `wl-paste` (Wayland) or `xclip` (X11) when installed.
 *
 * @returns  Absolute path to the saved temp image, or `null` if no image.
 */
export async function readClipboardImage(): Promise<string | null> {
  const tmpFile = join(tmpdir(), `atlas-clip-${Date.now()}-${randomHex()}.png`);

  try {
    const saved =
      process.platform === "win32"
        ? await readClipboardImageWindows(tmpFile)
        : process.platform === "darwin"
          ? await readClipboardImageMacOS(tmpFile)
          : await readClipboardImageLinux(tmpFile);

    if (saved && existsSync(tmpFile)) {
      return tmpFile;
    }
  } catch {
    // No image on clipboard or platform clipboard command unavailable.
  }

  cleanupTempFile(tmpFile);
  return null;
}

/**
 * Register a temp file for cleanup on process exit.
 * Call when a clipboard-derived temp file is consumed.
 */
export function scheduleClipboardCleanup(filePath: string): void {
  const disposable = () => {
    try {
      if (existsSync(filePath)) unlinkSync(filePath);
    } catch {
      // best-effort
    }
  };

  process.once("exit", disposable);
  process.on("SIGINT", disposable);
  process.on("SIGTERM", disposable);
  // Also clean up after a generous grace period (5 min)
  setTimeout(disposable, 5 * 60 * 1_000).unref();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const CLIPBOARD_IMAGE_MAX_BYTES = 25 * 1024 * 1024;

function cleanupTempFile(filePath: string): void {
  if (existsSync(filePath)) {
    try {
      unlinkSync(filePath);
    } catch {
      // best-effort
    }
  }
}

async function readClipboardImageWindows(tmpFile: string): Promise<boolean> {
  const psPath = await findPowerShell();
  if (!psPath) return false;

  // PowerShell single-quote escaping: '' → '
  const safePath = tmpFile.replace(/'/g, "''");

  const script = [
    "$img = Get-Clipboard -Format Image;",
    "if ($img) {",
    `  $img.Save('${safePath}');`,
    `  if (Test-Path '${safePath}') { Write-Output 'OK'; exit 0 }`,
    "}",
    `Write-Error 'No image'; exit 1`,
  ].join(" ");

  const { stdout } = await execFileAsync(
    psPath,
    ["-NoProfile", "-STA", "-NonInteractive", "-Command", script],
    {
      timeout: 10_000,
      windowsHide: true,
    },
  );

  return stdout.trim() === "OK";
}

async function readClipboardImageMacOS(tmpFile: string): Promise<boolean> {
  // Prefer pngpaste when available: it is the most reliable way to preserve
  // image clipboard bytes on macOS.
  try {
    await execFileAsync("pngpaste", [tmpFile], { timeout: 10_000 });
    if (existsSync(tmpFile)) return true;
  } catch {
    cleanupTempFile(tmpFile);
  }

  // Fallback for stock macOS without Homebrew dependencies.
  const script = String.raw`
on run argv
  set outPath to item 1 of argv
  try
    set imageData to the clipboard as «class PNGf»
  on error
    try
      set imageData to the clipboard as «class JPEG»
    on error
      return "NO_IMAGE"
    end try
  end try

  try
    set outFile to open for access (POSIX file outPath) with write permission
    set eof outFile to 0
    write imageData to outFile
    close access outFile
    return "OK"
  on error
    try
      close access (POSIX file outPath)
    end try
    return "NO_IMAGE"
  end try
end run`;

  const { stdout } = await execFileAsync("osascript", ["-e", script, tmpFile], {
    timeout: 10_000,
  });
  return stdout.trim() === "OK";
}

async function readClipboardImageLinux(tmpFile: string): Promise<boolean> {
  for (const candidate of [
    { command: "wl-paste", args: ["--type", "image/png"] },
    { command: "xclip", args: ["-selection", "clipboard", "-t", "image/png", "-o"] },
  ]) {
    try {
      const { stdout } = await execFileAsync(candidate.command, candidate.args, {
        encoding: "buffer",
        maxBuffer: CLIPBOARD_IMAGE_MAX_BYTES,
        timeout: 10_000,
      });
      if (Buffer.isBuffer(stdout) && stdout.length > 0) {
        writeFileSync(tmpFile, stdout);
        return true;
      }
    } catch {
      cleanupTempFile(tmpFile);
    }
  }
  return false;
}

/** Locate Windows PowerShell (Desktop edition, not Core). */
async function findPowerShell(): Promise<string | null> {
  for (const candidate of [
    // Windows PowerShell (Desktop) — has Get-Clipboard -Format Image
    join(
      process.env.SystemRoot || "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    ),
    // Fallback to PATH resolve
    "powershell.exe",
  ]) {
    try {
      const { stdout } = await execFileAsync(
        candidate,
        ["-NoProfile", "-Command", "$PSVersionTable.PSEdition"],
        { timeout: 3_000, windowsHide: true },
      );
      if (stdout.trim() === "Desktop") return candidate;
      // If we got here PowerShell Core returned something unexpected — skip
    } catch {}
  }
  return null;
}

/** Short cryptographically-random hex suffix for unique temp filenames. */
function randomHex(): string {
  return randomBytes(4).toString("hex");
}
