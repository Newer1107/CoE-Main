"use client";

import { useState } from "react";

interface ImpersonationBannerProps {
  isImpersonating: boolean;
  impersonatedBy?: { name: string; email: string } | null;
  impersonatingAs?: { name: string; email: string; role: string; uid?: string | null } | null;
}

export default function ImpersonationBanner({
  isImpersonating,
  impersonatedBy,
  impersonatingAs,
}: ImpersonationBannerProps) {
  const [isStopping, setIsStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isImpersonating) return null;

  const handleStop = async () => {
    setIsStopping(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/impersonate/stop", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        window.location.href = "/admin";
      } else {
        setError(data.message || "Failed to stop impersonation.");
        setIsStopping(false);
      }
    } catch {
      setError("Failed to stop impersonation. Please try again.");
      setIsStopping(false);
    }
  };

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-50 border-b border-amber-400 text-amber-900 flex items-center gap-2 px-4 py-2.5 text-sm">
        <span className="text-base" aria-hidden="true">
          ⚠
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">
            You are impersonating: {impersonatingAs?.name ?? "Unknown"} &middot;{" "}
            {impersonatingAs?.uid ?? "N/A"} &middot; {impersonatingAs?.role ?? "N/A"}
          </p>
          {impersonatedBy ? (
            <p className="text-xs text-amber-700 truncate">
              Original session: {impersonatedBy.name} ({impersonatedBy.email})
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleStop}
          disabled={isStopping}
          className="shrink-0 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
        >
          {isStopping ? "Stopping…" : "Stop Impersonation"}
        </button>
      </div>
      {error ? (
        <div role="alert" className="fixed top-14 left-0 right-0 z-[9999] bg-red-50 border-b border-red-400 text-red-700 px-4 py-2 text-sm text-center">
          {error}
        </div>
      ) : null}
    </>
  );
}
