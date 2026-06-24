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

function resolveAllowedRoot(dir: string, cwd: string): string {
  return isAbsolute(dir) ? normalize(resolve(dir)) : normalize(resolve(cwd, dir));
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

export function assertPathAllowed(imagePath: string, options: PathPolicyOptions): ResolvedImagePath {
  const cwd = normalize(resolve(options.cwd));
  const absolutePath = resolveImagePath(imagePath, cwd);
  const allowedRoots = options.allowedDirs.map((dir) => resolveAllowedRoot(dir, cwd));
  const allowed = allowedRoots.some((root) => isPathInsideRoot(absolutePath, root));

  if (!allowed) {
    throw new PathPolicyError(
      `Image path is outside allowed directories: ${imagePath}. Resolved path: ${absolutePath}. Current working directory: ${cwd}. Allowed directories: ${options.allowedDirs.join(", ")}`,
      {
        inputPath: imagePath,
        absolutePath,
        cwd,
        allowedDirs: options.allowedDirs,
      },
    );
  }

  return {
    inputPath: imagePath,
    absolutePath,
  };
}

export function formatPathPolicyError(error: PathPolicyError): string {
  return error.message;
}
