import axios from "axios";

import type { AnalyzeRepositoryResponse } from "../types/report";
import type { AnalysisProgress } from "../types/progress";
import type { ApiErrorBody } from "../types/errors";

const API_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_URL,
});

/**
 * Uploads a repository ZIP and starts a background analysis.
 * Resolves with the job id as soon as the upload finishes.
 */
export async function startAnalysis(
  file: File,
  onUploadProgress?: (fraction: number) => void,
): Promise<{ jobId: string }> {
  const formData = new FormData();

  formData.append("repository", file);

  const response = await api.post<{ jobId: string }>(
    "/analyze",
    formData,
    {
      onUploadProgress: (event) => {
        if (event.total) {
          onUploadProgress?.(event.loaded / event.total);
        }
      },
    },
  );

  return response.data;
}

/**
 * Starts a background analysis of a public GitHub repository.
 * GitHub is checked before the job starts, so a bad URL or private
 * repository fails here with a clear message.
 */
export async function startGithubAnalysis(
  url: string,
): Promise<{ jobId: string }> {
  const response = await api.post<{ jobId: string }>("/analyze/github", {
    url,
  });

  return response.data;
}

export interface JobHandlers {
  onProgress: (progress: AnalysisProgress) => void;
  onCompleted: (result: AnalyzeRepositoryResponse) => void;
  onFailed: (error: ApiErrorBody & { status: number }) => void;
  /**
   * The stream closed for good (job expired, server restarted).
   */
  onConnectionLost: () => void;
}

/**
 * Follows a job's progress over Server-Sent Events.
 * Returns a function that stops listening.
 */
export function subscribeToJob(
  jobId: string,
  handlers: JobHandlers,
): () => void {
  const source = new EventSource(
    `${API_URL}/jobs/${encodeURIComponent(jobId)}/events`,
  );

  let finished = false;

  const finish = () => {
    finished = true;
    source.close();
  };

  source.addEventListener("progress", (event) => {
    handlers.onProgress(JSON.parse((event as MessageEvent).data));
  });

  source.addEventListener("completed", (event) => {
    finish();
    handlers.onCompleted(JSON.parse((event as MessageEvent).data));
  });

  source.addEventListener("failed", (event) => {
    finish();
    handlers.onFailed(JSON.parse((event as MessageEvent).data));
  });

  source.onerror = () => {
    // While CONNECTING, the browser retries on its own and the server
    // resends the current state. CLOSED means it has given up.
    if (!finished && source.readyState === EventSource.CLOSED) {
      finished = true;
      handlers.onConnectionLost();
    }
  };

  return finish;
}
