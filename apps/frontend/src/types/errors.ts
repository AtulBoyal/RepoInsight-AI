export interface RepositoryTooLargeResponse {
  success: false;

  error: "REPOSITORY_TOO_LARGE";

  message: string;

  analyzableSizeMB: number;

  limitMB: number;
}

export interface UploadTooLargeResponse {
  success: false;

  error: "UPLOAD_TOO_LARGE";

  message: string;
}

/**
 * Shape of every error the backend returns, synchronously or
 * from a background job.
 */
export interface ApiErrorBody {
  success: false;
  error: string;
  message: string;
  [key: string]: unknown;
}
