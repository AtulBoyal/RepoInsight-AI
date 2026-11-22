import { useState } from "react";

import FloatingProgress from "../components/progress/FloatingProgress";

import Page from "../components/layout/Page";
import PageHeader from "../components/layout/PageHeader";
import UploadZone from "../components/upload/UploadZone";
import SelectedFile from "../components/upload/SelectedFile";
import AnalyzeButton from "../components/upload/AnalyzeButton";
import AnalysisProgress from "../components/status/AnalysisProgress";
import ReportViewer from "../components/report/ReportViewer";
import ProgressModal from "../components/progress/ProgressModal";
import RepositoryTooLargeModal from "../components/errors/RepositoryTooLargeModal";
import UploadTooLargeModal from "../components/errors/UploadTooLargeModal";

import { useAnalysis } from "../hooks/useAnalysis";

export default function HomePage() {
  const [file, setFile] =
    useState<File | null>(null);

  const [showProgress, setShowProgress] =
    useState(true);

  const {
    analyze,
    loading,
    error,
    result,
    progress,

    uploadTooLargeError,
    repositoryLimitError,

    reset,
  } = useAnalysis();

  return (
    <Page>
      <PageHeader
        title="RepoInsight AI"
        subtitle="Professional AI-powered engineering review for GitHub repositories."
      />

      <UploadZone
        onFileSelected={setFile}
      />

      {file && (
        <div className="mt-6">
          <SelectedFile
            file={file}
          />
        </div>
      )}

      <div className="mt-8">
        <AnalyzeButton
          disabled={!file}
          loading={loading}
          onClick={() => {
            if (!file) return;

            setShowProgress(true);

            analyze(file);
          }}
        />
      </div>

      <div className="mt-10">
        <AnalysisProgress
          stage={progress.stage}
        />

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {result && (
          <div className="mt-10">
            <ReportViewer result={result} />
          </div>
        )}

        {
        loading &&
          showProgress && (
            <ProgressModal
              progress={progress}
              onClose={() =>
                setShowProgress(false)
              }
            />
          )
        }

        {
        loading &&
          !showProgress && (
            <FloatingProgress
              progress={progress}
              onOpen={() =>
                setShowProgress(true)
              }
            />
          )
        }

        {uploadTooLargeError && (
          <UploadTooLargeModal
            onClose={() => {
              reset();
              setFile(null);
            }}
          />
        )}

        {repositoryLimitError && (
          <RepositoryTooLargeModal
            error={repositoryLimitError}
            onClose={reset}
          />
        )}
      </div>
    </Page>
  );
}