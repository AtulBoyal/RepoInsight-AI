import { History, RefreshCw } from "lucide-react";

interface Props {
  analyzedAt: string;
  loading: boolean;
  onReanalyze(): void;
}

/**
 * Shown above a report that was reused from an earlier analysis of the
 * same GitHub commit or the same ZIP.
 */
export default function CachedResultNotice({
  analyzedAt,
  loading,
  onReanalyze,
}: Props) {
  const when = new Date(analyzedAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex items-start gap-2">
        <History size={18} className="mt-0.5 shrink-0" />
        <span>
          This exact code was analyzed before, so the report from{" "}
          <strong>{when}</strong> was reused instantly.
        </span>
      </p>

      <button
        type="button"
        onClick={onReanalyze}
        disabled={loading}
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-300 bg-white px-4 py-2 font-medium text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw size={16} />
        Re-analyze
      </button>
    </div>
  );
}
