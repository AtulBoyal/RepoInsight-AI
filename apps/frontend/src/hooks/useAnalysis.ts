import { useEffect, useRef, useState } from "react";
import axios from "axios";

import { startAnalysis, subscribeToJob } from "../services/api";
import type { AnalyzeRepositoryResponse } from "../types/report";
import type { AnalysisProgress } from "../types/progress";
import type {
  ApiErrorBody,
  RepositoryTooLargeResponse,
  UploadTooLargeResponse,
} from "../types/errors";
import { MAX_UPLOAD_SIZE } from "../constants/upload";

const IDLE: AnalysisProgress = {
  stage: "IDLE",
  message: "",
  percentage: 0,
};

const FAILED: AnalysisProgress = {
  stage: "FAILED",
  message: "Analysis failed.",
  percentage: 100,
};

const UPLOAD_TOO_LARGE: UploadTooLargeResponse = {
  success: false,
  error: "UPLOAD_TOO_LARGE",
  message: `Maximum upload size is ${MAX_UPLOAD_SIZE / 1024 / 1024} MB.`,
};

/**
 * Uploads a repository, then follows the analysis job over
 * Server-Sent Events until it completes or fails.
 */
export function useAnalysis() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [repositoryLimitError, setRepositoryLimitError] =
    useState<RepositoryTooLargeResponse | null>(null);
  const [uploadTooLargeError, setUploadTooLargeError] =
    useState<UploadTooLargeResponse | null>(null);
  const [result, setResult] =
    useState<AnalyzeRepositoryResponse | null>(null);
  const [progress, setProgress] = useState<AnalysisProgress>(IDLE);

  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => () => unsubscribeRef.current?.(), []);

  function reset() {
    setResult(null);
    setError("");
    setRepositoryLimitError(null);
    setUploadTooLargeError(null);
  }

  /**
   * Shows the right UI for a backend error, whether it came from
   * the upload request or from the background job.
   */
  function handleFailure(body: ApiErrorBody | undefined, status?: number) {
    setLoading(false);

    if (body?.error === "REPOSITORY_TOO_LARGE") {
      setRepositoryLimitError(body as unknown as RepositoryTooLargeResponse);
      setProgress(IDLE);
      return;
    }

    if (body?.error === "UPLOAD_TOO_LARGE" || status === 413) {
      setUploadTooLargeError({
        ...UPLOAD_TOO_LARGE,
        message: body?.message ?? UPLOAD_TOO_LARGE.message,
      });
      setProgress(IDLE);
      return;
    }

    setError(body?.message ?? "Analysis failed.");
    setProgress(FAILED);
  }

  async function analyze(file: File) {
    unsubscribeRef.current?.();
    reset();

    if (file.size > MAX_UPLOAD_SIZE) {
      setUploadTooLargeError(UPLOAD_TOO_LARGE);
      return;
    }

    setLoading(true);
    setProgress({
      stage: "UPLOADING",
      message: "Uploading repository...",
      percentage: 0,
    });

    let jobId: string;

    try {
      ({ jobId } = await startAnalysis(file, (fraction) => {
        setProgress({
          stage: "UPLOADING",
          message: `Uploading repository... ${Math.round(fraction * 100)}%`,
          percentage: Math.round(fraction * 5),
        });
      }));
    } catch (requestError) {
      if (axios.isAxiosError(requestError)) {
        if (
          !requestError.response &&
          (requestError.code === "ERR_NETWORK" ||
            requestError.code === "ECONNABORTED")
        ) {
          handleFailure({
            success: false,
            error: "UPLOAD_TOO_LARGE",
            message:
              "The upload could not be completed. The file is likely too large or the connection was interrupted.",
          });
          return;
        }

        handleFailure(
          requestError.response?.data as ApiErrorBody | undefined,
          requestError.response?.status,
        );
        return;
      }

      handleFailure(undefined);
      return;
    }

    unsubscribeRef.current = subscribeToJob(jobId, {
      onProgress: setProgress,

      onCompleted: (response) => {
        setResult(response);
        setProgress({
          stage: "COMPLETED",
          message: "Analysis completed.",
          percentage: 100,
        });
        setLoading(false);
      },

      onFailed: ({ status, ...body }) => handleFailure(body, status),

      onConnectionLost: () =>
        handleFailure({
          success: false,
          error: "CONNECTION_LOST",
          message: "Lost connection to the analysis. Please try again.",
        }),
    });
  }

  return {
    loading,
    error,
    uploadTooLargeError,
    repositoryLimitError,
    result,
    progress,
    analyze,
    reset,
  };
}
