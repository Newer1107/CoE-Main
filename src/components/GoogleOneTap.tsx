"use client";

import { GoogleOAuthProvider, useGoogleOneTapLogin } from "@react-oauth/google";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { DEFAULT_CALLBACK_URL } from "@/lib/callback-url";

const DISMISS_KEY = "coe_onetap_dismissed";

/**
 * Google One Tap — the account-chooser popup that appears on page load
 * (like Reddit). Mounted in the root layout for logged-out visitors.
 * Dismissal (cancel / error / non-login action) is remembered for the
 * session so it never nags on every navigation; a fresh visit re-prompts.
 */
function OneTapInner() {
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
    } catch {
      /* storage blocked — prompt anyway */
    }
  }, []);

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  useGoogleOneTapLogin({
    onSuccess: async (credentialResponse) => {
      try {
        const res = await fetch("/api/auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: credentialResponse.credential }),
          credentials: "include",
        });
        const data = await res.json();
        // "login" → straight in. Anything else (register/link/error) →
        // the login page already has the full flow for it.
        if (res.ok && data?.data?.action === "login") {
          window.location.assign(DEFAULT_CALLBACK_URL);
          return;
        }
        dismiss();
      } catch {
        dismiss();
      }
    },
    onError: () => dismiss(),
    cancel_on_tap_outside: true,
    use_fedcm_for_prompt: true,
    disabled: dismissed || pathname === "/login" || pathname.startsWith("/login"),
  });

  return null;
}

export default function GoogleOneTap({ clientId }: { clientId: string }) {
  return (
    <GoogleOAuthProvider clientId={clientId}>
      <OneTapInner />
    </GoogleOAuthProvider>
  );
}
