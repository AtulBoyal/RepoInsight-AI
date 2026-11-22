import { useEffect, useState } from "react";
import axios from "axios";
import { CalendarClock, LoaderCircle, SearchX } from "lucide-react";

import Page from "../components/layout/Page";
import ReportViewer from "../components/report/ReportViewer";
import ShareControls from "../components/report/ShareControls";
import { getSharedReport } from "../services/api";
import type { SharedReportResponse } from "../types/report";

interface Props {
  shareId: string;
}

type State =
  | { status: "loading" }
  | { status: "loaded"; report: SharedReportResponse }
  | { status: "missing"; message: string }
  | { status: "unshared" };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}

/**
 * A report opened from a share link (/r/<shareId>). Read-only.
 */
export default function SharedReportPage({ shareId }: Props) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let active = true;

    getSharedReport(shareId)
      .then((report) => {
        if (active) setState({ status: "loaded", report });
      })
      .catch((error: unknown) => {
        if (!active) return;

        const message =
          axios.isAxiosError(error) && typeof error.response?.data?.message === "string"
            ? error.response.data.message
            : "This report could not be loaded. Please try again later.";

        setState({ status: "missing", message });
      });

    return () => {
      active = false;
    };
  }, [shareId]);

  return (
    <Page>
      <nav className="mb-10 flex items-center justify-between">
        <a href="/" className="text-lg font-bold tracking-tight text-slate-900">
          RepoInsight AI
        </a>
        <a
          href="/"
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          Analyze your own repository
        </a>
      </nav>

      {state.status === "loading" && (
        <div className="flex items-center justify-center gap-3 py-24 text-slate-500">
          <LoaderCircle className="animate-spin" size={22} />
          Loading shared report...
        </div>
      )}

      {(state.status === "missing" || state.status === "unshared") && (
        <div className="mx-auto max-w-lg rounded-3xl border bg-white p-10 text-center shadow-sm">
          <SearchX className="mx-auto text-slate-400" size={40} />
          <h1 className="mt-4 text-2xl font-bold">
            {state.status === "unshared" ? "Link removed" : "Report not available"}
          </h1>
          <p className="mt-3 text-slate-600">
            {state.status === "unshared"
              ? "This report is no longer shared. The link has stopped working for everyone."
              : state.message}
          </p>
        </div>
      )}

      {state.status === "loaded" && (
        <>
          <p className="mb-6 flex items-center gap-2 text-sm text-slate-500">
            <CalendarClock size={16} />
            Shared report · analyzed {formatDate(state.report.analyzedAt)} · link
            expires {formatDate(state.report.expiresAt)}
          </p>

          <ReportViewer
            result={state.report}
            actions={
              <ShareControls
                shareId={shareId}
                onUnshared={() => setState({ status: "unshared" })}
              />
            }
          />
        </>
      )}
    </Page>
  );
}
