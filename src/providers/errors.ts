export type ProviderErrorCode =
  | "auth"
  | "timeout"
  | "http"
  | "invalid_response"
  | "network"
  | "rate_limit";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly statusCode?: number;

  constructor(message: string, code: ProviderErrorCode, statusCode?: number) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
