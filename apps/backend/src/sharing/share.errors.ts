export type ShareErrorCode =
  | "SHARING_UNAVAILABLE"
  | "REPORT_NOT_FOUND"
  | "SHARED_REPORT_NOT_FOUND"
  | "NOT_SHARE_OWNER";

const STATUS: Record<ShareErrorCode, number> = {
  SHARING_UNAVAILABLE: 503,
  REPORT_NOT_FOUND: 404,
  SHARED_REPORT_NOT_FOUND: 404,
  NOT_SHARE_OWNER: 403,
};

export class ShareError extends Error {
  readonly code: ShareErrorCode;

  readonly status: number;

  constructor(code: ShareErrorCode, message: string) {
    super(message);

    this.name = "ShareError";
    this.code = code;
    this.status = STATUS[code];
  }
}
