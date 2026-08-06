import { realpath } from "node:fs/promises";
import { isAbsolute, normalize, resolve } from "node:path";

export interface PathPolicyOptions {
  allowedDirs: string[];
  cwd: string;
}

export interface ResolvedImagePath {
  inputPath: string;
  absolutePath: string;
}

export class PathPolicyError extends Error {
  readonly inputPath: string;
  readonly absolutePath: string;
  readonly cwd: string;
  readonly allowedDirs: string[];

  constructor(
    message: string,
    options: {
      inputPath: string;
      absolutePath: string;
      cwd: string;
      allowedDirs: string[];
    },
  ) {
    super(message);
    this.name = "PathPolicyError";
    this.inputPath = options.inputPath;
    this.absolutePath = options.absolutePath;
    this.cwd = options.cwd;
    this.allowedDirs = options.allowedDirs;
  }
}

async function resolveAllowedRoots(dirs: string[], cwd: string): Promise<string[]> {
  const roots: string[] = [];
  for (const dir of dirs) {
    const resolved = isAbsolute(dir) ? normalize(resolve(dir)) : normalize(resolve(cwd, dir));
    try {
      // Realpath the root so it matches the realpath'd image path: on macOS
      // /tmp and /var are symlinks to /private/tmp and /private/var, so a
      // prefix comparison against the un-resolved root would reject every
      // image under them.
      roots.push(await realpath(resolved));
    } catch {
      // Root doesn't exist yet (e.g. a relative ./assets) — keep the resolved path.
      roots.push(resolved);
    }
  }
  return roots;
}

function pathsEqual(left: string, right: string): boolean {
  if (process.platform === "win32") {
    return left.toLowerCase() === right.toLowerCase();
  }
  return left === right;
}

function isPathInsideRoot(target: string, root: string): boolean {
  const normalizedTarget = normalize(target);
  const normalizedRoot = normalize(root);

  if (pathsEqual(normalizedTarget, normalizedRoot)) {
    return true;
  }

  const separator = process.platform === "win32" ? "\\" : "/";
  const prefix = normalizedRoot.endsWith(separator)
    ? normalizedRoot
    : `${normalizedRoot}${separator}`;

  if (process.platform === "win32") {
    return normalizedTarget.toLowerCase().startsWith(prefix.toLowerCase());
  }

  return normalizedTarget.startsWith(prefix);
}

export function resolveImagePath(imagePath: string, cwd: string): string {
  return isAbsolute(imagePath) ? normalize(resolve(imagePath)) : normalize(resolve(cwd, imagePath));
}

export async function assertPathAllowed(
  imagePath: string,
  options: PathPolicyOptions,
): Promise<ResolvedImagePath> {
  const cwd = normalize(resolve(options.cwd));
  const absolutePath = resolveImagePath(imagePath, cwd);

  // Resolve symlinks to prevent symlink traversal bypasses
  let realPath: string;
  try {
    realPath = await realpath(absolutePath);
  } catch {
    // If realpath fails (file doesn't exist yet), use the resolved path
    realPath = absolutePath;
  }

  const allowedRoots = await resolveAllowedRoots(options.allowedDirs, cwd);
  const allowed = allowedRoots.some((root) => isPathInsideRoot(realPath, root));

  if (!allowed) {
    throw new PathPolicyError(`Image path is outside allowed directories: ${imagePath}.`, {
      inputPath: imagePath,
      absolutePath,
      cwd,
      allowedDirs: options.allowedDirs,
    });
  }

  return {
    inputPath: imagePath,
    absolutePath: realPath,
  };
}

export function formatPathPolicyError(error: PathPolicyError): string {
  return error.message;
}
