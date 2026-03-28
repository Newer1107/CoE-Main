"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [needsOtp, setNeedsOtp] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const getSafeNextPath = () => {
    const next = searchParams.get("next") || "";
    if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/login")) {
      return null;
    }
    return next;
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setStatus("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });

      const data = await res.json();
      if (!res.ok) {
        if (data?.needsVerification) {
          setNeedsOtp(true);
          setStatus("Verify your email with the OTP we just sent.");
          return;
        }
        throw new Error(data?.message || "Login failed.");
      }

      const role = data?.data?.user?.role;
      const safeNext = getSafeNextPath();
      if (role === "ADMIN") {
        router.push("/admin");
      } else if (role === "FACULTY") {
        router.push("/faculty");
      } else {
        router.push(safeNext || "/facility-booking");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError("");
    setStatus("");
    setOtpLoading(true);
    try {
      const res = await fetch("/api/auth/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to resend OTP.");
      setStatus("OTP resent. Please check your inbox.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend OTP.");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setStatus("");
    setOtpLoading(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "OTP verification failed.");
      setNeedsOtp(false);
      setOtp("");
      setStatus("Email verified. Please login again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "OTP verification failed.");
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <main className="min-h-screen pt-[120px] pb-16 px-4 md:px-8">
      <section className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 bg-[#002155] text-white p-8 md:p-10 border border-[#0b2a5a] relative overflow-hidden">
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at top, #ffffff 0%, transparent 55%)" }} />
          <div className="relative z-10 space-y-6">
            <p className="text-xs uppercase tracking-[0.35em] text-[#fd9923]">Secure Access</p>
            <h1 className="font-headline text-4xl md:text-[44px] leading-tight">
              Login to the
              <span className="block text-[#fd9923]">Center of Excellence</span>
            </h1>
            <p className="text-sm text-white/80 font-body leading-relaxed">
              Use your institutional account to manage bookings, faculty workflows, and admin approvals.
              Admin users will be routed straight to the control room after login.
            </p>
            <div className="border-t border-white/20 pt-6">
              <p className="text-xs uppercase tracking-[0.3em] text-white/70">Need an account?</p>
              <Link href="/facility-booking" className="mt-3 inline-flex text-sm uppercase tracking-[0.2em] text-[#fd9923] hover:text-white">
                Register for Access →
              </Link>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-[#c4c6d3] p-6 md:p-10">
          <h2 className="font-headline text-2xl md:text-3xl text-[#002155]">Account Login</h2>
          <p className="mt-2 text-sm text-[#434651] font-body">
            Sign in with your @tcetmumbai.in email address to continue.
          </p>

          {error ? <p className="mt-4 border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</p> : null}
          {status ? <p className="mt-4 border border-green-200 bg-green-50 text-green-700 px-4 py-3 text-sm">{status}</p> : null}

          <form className="mt-6 space-y-5" onSubmit={handleLogin}>
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
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-[#434651]">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full border border-[#747782] p-3 text-sm outline-none focus:border-[#002155]"
              />
              <div className="pt-1 text-right">
                <Link href="/forgot-password" className="text-[11px] font-bold uppercase tracking-wider text-[#8c4f00] hover:text-[#002155]">
                  Forgot Password?
                </Link>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#002155] text-white py-3 text-xs font-bold uppercase tracking-[0.3em] hover:bg-[#1a438e] disabled:opacity-70"
            >
              {loading ? "Signing in..." : "Login"}
            </button>
          </form>

          {needsOtp ? (
            <div className="mt-8 border-t border-[#e3e2df] pt-6">
              <h3 className="text-sm font-bold uppercase tracking-widest text-[#002155]">Verify Email</h3>
              <p className="mt-2 text-sm text-[#434651]">
                Enter the OTP from your email to activate your account.
              </p>
              <form className="mt-4 space-y-4" onSubmit={handleVerifyOtp}>
                <input
                  type="text"
                  maxLength={6}
                  required
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                  placeholder="6-digit OTP"
                  className="w-full border border-[#747782] p-3 text-sm outline-none focus:border-[#002155]"
                />
                <button
                  type="submit"
                  disabled={otpLoading}
                  className="w-full border border-[#002155] text-[#002155] py-3 text-xs font-bold uppercase tracking-[0.3em] hover:bg-[#002155] hover:text-white disabled:opacity-70"
                >
                  {otpLoading ? "Verifying..." : "Verify OTP"}
                </button>
              </form>
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={otpLoading}
                className="mt-4 text-xs font-bold uppercase tracking-widest text-[#8c4f00] hover:text-[#002155]"
              >
                Resend OTP
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
