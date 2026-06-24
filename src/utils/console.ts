/**
 * Console redirection utility for MCP stdio servers.
 *
 * When running as a stdio MCP server, stdout is used for JSON-RPC messages.
 * Any stray console.log / console.info calls will corrupt the protocol.
 * This utility redirects all console output to stderr.
 */

let redirected = false;

export function setupConsoleRedirection(): void {
  if (redirected) return;
  redirected = true;

  // redirect all console output to stderr, but keep error on stderr too
  console.log = (...args: unknown[]) => {
    process.stderr.write(`${args.map(String).join(" ")}\n`);
  };

  console.info = (...args: unknown[]) => {
    process.stderr.write(`${args.map(String).join(" ")}\n`);
  };

  console.warn = (...args: unknown[]) => {
    process.stderr.write(`WARN: ${args.map(String).join(" ")}\n`);
  };

  console.error = (...args: unknown[]) => {
    process.stderr.write(`ERROR: ${args.map(String).join(" ")}\n`);
  };

  // Also handle process.stdout.write for raw writes that bypass console
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  (process.stdout as { write: typeof process.stdout.write }).write = (
    chunk: unknown,
    encoding?: unknown,
    callback?: unknown,
  ): boolean => {
    const text =
      typeof chunk === "string" ? chunk : Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk);
    // Allow writes that look like JSON-RPC (start with { or [)
    if (text.startsWith("{") || text.startsWith("[")) {
      return originalStdoutWrite(
        chunk as string | Uint8Array,
        encoding as BufferEncoding,
        callback as (error?: Error | null) => void,
      );
    }
    // All other writes go to stderr
    process.stderr.write(text);
    return true;
  };
}
