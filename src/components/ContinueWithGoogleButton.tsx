"use client";

import { GoogleOAuthProvider, useGoogleOneTapLogin } from "@react-oauth/google";
import { useState } from "react";
import { DEFAULT_CALLBACK_URL } from "@/lib/callback-url";

/**
 * "Continue with Google" — opens the Google account-chooser popup on demand
 * (the same dialog Google One Tap shows automatically, but guaranteed).
 */
function ContinueWithGoogleInner({
  width,
  onSuccess,
  onError,
}: {
  width?: number;
  onSuccess?: (credential: string) => void;
  onError?: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useGoogleOneTapLogin({
    onSuccess: async (response) => {
      setBusy(true);
      try {
        if (onSuccess && response.credential) {
          onSuccess(response.credential);
          return;
        }
        const res = await fetch("/api/auth/google", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ credential: response.credential }),
        });
        const body = (await res.json().catch(() => null)) as {
          success?: boolean;
          data?: { action?: string };
        } | null;
        const action = body?.data?.action;
        if (body?.success && (action === "login" || action === "register" || action === "link")) {
          window.location.assign(DEFAULT_CALLBACK_URL);
          return;
        }
        window.location.assign("/login");
      } finally {
        setBusy(false);
        setArmed(false);
      }
    },
    onError: () => {
      setArmed(false);
      setBusy(false);
      onError?.();
    },
    disabled: !armed,
    use_fedcm_for_prompt: true,
  });

  return (
    <button
      type="button"
      onClick={() => setArmed(true)}
      disabled={busy}
      style={width ? { width } : undefined}
      className="flex min-h-[48px] items-center justify-center gap-2.5 border border-[#c4c6d3] bg-white px-6 py-2.5 text-sm font-semibold text-[#434651] transition-colors hover:border-[#002155] hover:text-[#002155] disabled:opacity-60"
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
        <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C41.4 35.9 44 30.5 44 24c0-1.3-.1-2.6-.4-3.9z"/>
      </svg>
      Continue with Google
    </button>
  );
}

export default function ContinueWithGoogleButton({
  clientId,
  width,
  onSuccess,
  onError,
}: {
  clientId: string;
  width?: number;
  onSuccess?: (credential: string) => void;
  onError?: () => void;
}) {
  return (
    <GoogleOAuthProvider clientId={clientId}>
      <ContinueWithGoogleInner width={width} onSuccess={onSuccess} onError={onError} />
    </GoogleOAuthProvider>
  );
}
