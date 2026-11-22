import { useState } from "react";
import axios from "axios";
import { Check, Copy, Link2, LoaderCircle, Link2Off } from "lucide-react";

import { shareReport, unshareReport } from "../../services/api";
import {
  forgetOwnerToken,
  getOwnerToken,
  saveOwnerToken,
  shareUrl,
} from "../../sharing/shareLinks";

interface Props {
  /** Saved report that can be shared (results page). */
  reportId?: string;
  /** Already shared report (shared-report page). */
  shareId?: string;
  /** Called after this browser removed the link. */
  onUnshared?(): void;
}

function errorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: unknown } | undefined)?.message;

    if (typeof message === "string") return message;
  }

  return fallback;
}

/**
 * Share button, then the link with Copy and (for the browser that
 * shared it) Stop sharing.
 */
export default function ShareControls({ reportId, shareId: initialShareId, onUnshared }: Props) {
  const [shareId, setShareId] = useState(initialShareId);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const canUnshare = shareId ? getOwnerToken(shareId) !== undefined : false;

  async function share() {
    if (!reportId) return;

    setBusy(true);
    setError("");

    try {
      const result = await shareReport(reportId);

      if (result.ownerToken) {
        saveOwnerToken(result.shareId, result.ownerToken);
      }

      setShareId(result.shareId);
    } catch (shareError) {
      setError(errorMessage(shareError, "Could not create a share link. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!shareId) return;

    try {
      await navigator.clipboard.writeText(shareUrl(shareId));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy failed. Select the link and copy it manually.");
    }
  }

  async function unshare() {
    const token = shareId ? getOwnerToken(shareId) : undefined;

    if (!shareId || !token) return;

    setBusy(true);
    setError("");

    try {
      await unshareReport(shareId, token);
      forgetOwnerToken(shareId);
      setShareId(undefined);
      onUnshared?.();
    } catch (unshareError) {
      setError(errorMessage(unshareError, "Could not remove the link. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  if (!shareId && !reportId) {
    return null;
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
      {!shareId ? (
        <button
          type="button"
          onClick={share}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 font-medium text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <LoaderCircle size={18} className="animate-spin" /> : <Link2 size={18} />}
          Share
        </button>
      ) : (
        <div className="flex w-full flex-col gap-2 sm:w-96">
          <div className="flex gap-2">
            <input
              readOnly
              aria-label="Share link"
              value={shareUrl(shareId)}
              onFocus={(event) => event.target.select()}
              className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
            />
            <button
              type="button"
              onClick={copy}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <p className="text-xs text-slate-500">
            Anyone with this link can view the report, including code snippets.
            {canUnshare && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={unshare}
                  disabled={busy}
                  className="inline-flex items-center gap-1 font-medium text-red-600 hover:underline disabled:opacity-60"
                >
                  <Link2Off size={12} />
                  Stop sharing
                </button>
              </>
            )}
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
