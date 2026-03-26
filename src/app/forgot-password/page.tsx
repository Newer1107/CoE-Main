"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [step, setStep] = useState<"request" | "reset">("request");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const handleRequestOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setStatus("");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Could not send reset OTP.");
      setStatus(data?.message || "If this email is registered, a reset OTP has been sent.");
      setStep("reset");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setStatus("");

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Could not reset password.");
      setStatus("Password reset successful. You can now log in.");
      setOtp("");
      setNewPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen pt-[120px] pb-16 px-4 md:px-8">
      <section className="max-w-3xl mx-auto border border-[#c4c6d3] bg-white p-6 md:p-10">
        <h1 className="font-headline text-3xl text-[#002155]">Forgot Password</h1>
        <p className="mt-2 text-sm text-[#434651]">
          Request a one-time password on your registered email and set a new account password.
        </p>

        {error ? <p className="mt-4 border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</p> : null}
        {status ? <p className="mt-4 border border-green-200 bg-green-50 text-green-700 px-4 py-3 text-sm">{status}</p> : null}

        {step === "request" ? (
          <form className="mt-6 space-y-4" onSubmit={handleRequestOtp}>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-[#434651]">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@tcetmumbai.in"
                className="w-full border border-[#747782] p-3 text-sm outline-none focus:border-[#002155]"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#002155] text-white py-3 text-xs font-bold uppercase tracking-[0.3em] hover:bg-[#1a438e] disabled:opacity-70"
            >
              {loading ? "Sending..." : "Send Reset OTP"}
            </button>
          </form>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleResetPassword}>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-[#434651]">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full border border-[#747782] p-3 text-sm outline-none focus:border-[#002155]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-[#434651]">OTP</label>
              <input
                type="text"
                required
                maxLength={6}
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                placeholder="6-digit code"
                className="w-full border border-[#747782] p-3 text-sm outline-none focus:border-[#002155]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-[#434651]">New Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="w-full border border-[#747782] p-3 text-sm outline-none focus:border-[#002155]"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#002155] text-white py-3 text-xs font-bold uppercase tracking-[0.3em] hover:bg-[#1a438e] disabled:opacity-70"
            >
              {loading ? "Resetting..." : "Reset Password"}
            </button>
            <button
              type="button"
              onClick={() => setStep("request")}
              className="w-full border border-[#c4c6d3] text-[#002155] py-3 text-xs font-bold uppercase tracking-[0.3em] hover:bg-[#f5f4f0]"
            >
              Request New OTP
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link href="/login" className="text-xs font-bold uppercase tracking-widest text-[#8c4f00] hover:text-[#002155]">
            Back to Login
          </Link>
        </div>
      </section>
    </main>
  );
}
