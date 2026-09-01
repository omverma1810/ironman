/**
 * Mirrors the one error envelope every endpoint returns (docs/04 §2).
 * `message` is written server-side to be shown to a user verbatim.
 */
export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    detail: string | null;
    field_errors: Record<string, string[]>;
    request_id: string;
    retryable: boolean;
  };
};

export class ApiError extends Error {
  code: string;
  detail: string | null;
  fieldErrors: Record<string, string[]>;
  requestId: string;
  retryable: boolean;
  status: number;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.error.code;
    this.detail = body.error.detail;
    this.fieldErrors = body.error.field_errors;
    this.requestId = body.error.request_id;
    this.retryable = body.error.retryable;
  }

  static isApiError(err: unknown): err is ApiError {
    return err instanceof ApiError;
  }
}
