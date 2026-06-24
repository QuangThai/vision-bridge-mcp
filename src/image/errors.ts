export type ImageErrorCode =
  | "not_found"
  | "unsupported_format"
  | "too_large"
  | "unreadable"
  | "path_not_allowed";

export class ImageError extends Error {
  readonly code: ImageErrorCode;
  readonly path?: string;

  constructor(message: string, code: ImageErrorCode, path?: string) {
    super(message);
    this.name = "ImageError";
    this.code = code;
    this.path = path;
  }
}
