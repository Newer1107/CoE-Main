"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/ToastProvider";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const { pushToast } = useToast();
  const hasShownBookingRequiredToast = useRef(false);
  const [activeAuthMode, setActiveAuthMode] = useState<"login" | "register-student" | "register-faculty">("login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPhone, setRegisterPhone] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerUid, setRegisterUid] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [needsOtp, setNeedsOtp] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (hasShownBookingRequiredToast.current) return;

    const reason = searchParams.get("reason");
    if (!reason) return;

    let message = "";

    switch (reason) {
      case "booking-auth-required":
        message = "You must be logged in to book a facility.";
        break;

      case "problem-register-auth-required":
        message = "Please log in to register for this problem statement.";
        break;

      default:
        return;
    }

    hasShownBookingRequiredToast.current = true;
    setStatus(message);
    pushToast(message, "info");
  }, [pushToast, searchParams]);

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
        body: JSON.stringify({ identifier, password }),
        credentials: "include",
      });

      const data = await res.json();
      if (!res.ok) {
        if (data?.needsVerification) {
          setVerificationEmail(data?.email || "");
          setNeedsOtp(true);
          setStatus("Verify your email with the OTP we just sent.");
          pushToast("Verify your email with OTP to continue.", "info");
          return;
        }
        throw new Error(data?.message || "Login failed.");
      }

      const role = data?.data?.user?.role;
      const safeNext = getSafeNextPath();
      const destination = role === "ADMIN"
        ? "/admin"
        : role === "FACULTY"
          ? "/faculty"
          : safeNext || "/facility-booking";

      // Force a full navigation so server-rendered navbar auth state updates immediately.
      window.location.assign(destination);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed.";
      setError(message);
      pushToast(message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError("");
    setStatus("");
    setOtpLoading(true);
    try {
      const targetEmail = verificationEmail || (identifier.includes("@") ? identifier.trim().toLowerCase() : "");
      if (!targetEmail) {
        throw new Error("Email is required to resend OTP. Please login using email once.");
      }

      const res = await fetch("/api/auth/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to resend OTP.");
      setStatus("OTP resent. Please check your inbox.");
      pushToast("OTP resent. Please check your inbox.", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to resend OTP.";
      setError(message);
      pushToast(message, "error");
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
      const targetEmail = verificationEmail || (identifier.includes("@") ? identifier.trim().toLowerCase() : "");
      if (!targetEmail) {
        throw new Error("Email is required for OTP verification. Please login using email once.");
      }

      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail, otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "OTP verification failed.");
      setNeedsOtp(false);
      setOtp("");
      setStatus("Email verified. Please login again.");
      pushToast("Email verified. You can login now.", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "OTP verification failed.";
      setError(message);
      pushToast(message, "error");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setStatus("");
    setRegisterLoading(true);

    try {
      if (activeAuthMode === "register-student") {
        const res = await fetch("/api/auth/register/student", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: registerName,
            email: registerEmail,
            phone: registerPhone,
            password: registerPassword,
            uid: registerUid,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || "Student registration failed.");

        setVerificationEmail(registerEmail.trim().toLowerCase());
        setNeedsOtp(true);
        setStatus("Student registration successful. Verify your email with OTP.");
        pushToast("Registration successful. OTP sent to your email.", "success");
        setActiveAuthMode("login");
      } else {
        const res = await fetch("/api/auth/register/faculty", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: registerName,
            email: registerEmail,
            phone: registerPhone,
            password: registerPassword,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || "Faculty registration failed.");

        setStatus("Faculty registration submitted. Await admin approval.");
        pushToast("Faculty registration submitted successfully.", "success");
        setActiveAuthMode("login");
      }

      setRegisterName("");
      setRegisterEmail("");
      setRegisterPhone("");
      setRegisterPassword("");
      setRegisterUid("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed.";
      setError(message);
      pushToast(message, "error");
    } finally {
      setRegisterLoading(false);
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
              Established with a vision to bridge the gap between academic theory and industrial application, the TCET Center of Excellence (CoE) stands as a testament to institutional persistence.
            </p>
            <div className="border-t border-white/20 pt-6">
              <p className="text-xs uppercase tracking-[0.3em] text-white/70">Need an account?</p>
              <button
                type="button"
                onClick={() => {
                  setActiveAuthMode("register-student");
                  setNeedsOtp(false);
                  setError("");
                  setStatus("");
                }}
                className="mt-3 inline-flex text-sm uppercase tracking-[0.2em] text-[#fd9923] hover:text-white"
              >
                Register for Access →
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-[#c4c6d3] p-6 md:p-10">
          <h2 className="font-headline text-2xl md:text-3xl text-[#002155]">Account Login</h2>
          <p className="mt-2 text-sm text-[#434651] font-body">
            Sign in with your @tcetmumbai.in email address or your UID. UID format: STARTYEAR-BRANCHDIVISIONROLLNO-ENDYEAR (example: 24-COMPD13-28).
          </p>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setActiveAuthMode("login")}
              className={`border px-3 py-2 text-[11px] font-bold uppercase tracking-wider ${activeAuthMode === "login" ? "bg-[#002155] text-white border-[#002155]" : "bg-white text-[#002155] border-[#c4c6d3]"
                }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setActiveAuthMode("register-student")}
              className={`border px-3 py-2 text-[11px] font-bold uppercase tracking-wider ${activeAuthMode === "register-student" ? "bg-[#002155] text-white border-[#002155]" : "bg-white text-[#002155] border-[#c4c6d3]"
                }`}
            >
              Register Student
            </button>
            <button
              type="button"
              onClick={() => setActiveAuthMode("register-faculty")}
              className={`border px-3 py-2 text-[11px] font-bold uppercase tracking-wider ${activeAuthMode === "register-faculty" ? "bg-[#002155] text-white border-[#002155]" : "bg-white text-[#002155] border-[#c4c6d3]"
                }`}
            >
              Register Faculty
            </button>
          </div>

          {error ? <p className="mt-4 border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</p> : null}
          {status ? <p className="mt-4 border border-green-200 bg-green-50 text-green-700 px-4 py-3 text-sm">{status}</p> : null}

          {activeAuthMode === "login" ? (
            <form className="mt-6 space-y-5" onSubmit={handleLogin}>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-[#434651]">Email or UID</label>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="name@tcetmumbai.in or 24-COMPD13-28"
                  className="w-full border border-[#747782] p-3 text-sm outline-none focus:border-[#002155]"
                />
                <p className="text-[11px] text-[#434651]">UID format example: 24-COMPD13-28</p>
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
          ) : (
            <form className="mt-6 space-y-5" onSubmit={handleRegister}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-[#434651]">Full Name</label>
                  <input
                    type="text"
                    required
                    value={registerName}
                    onChange={(event) => setRegisterName(event.target.value)}
                    className="w-full border border-[#747782] p-3 text-sm outline-none focus:border-[#002155]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-[#434651]">Institutional Email</label>
                  <input
                    type="email"
                    required
                    value={registerEmail}
                    onChange={(event) => setRegisterEmail(event.target.value)}
                    placeholder="name@tcetmumbai.in"
                    className="w-full border border-[#747782] p-3 text-sm outline-none focus:border-[#002155]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-[#434651]">Phone</label>
                  <input
                    type="text"
                    required
                    value={registerPhone}
                    onChange={(event) => setRegisterPhone(event.target.value)}
                    className="w-full border border-[#747782] p-3 text-sm outline-none focus:border-[#002155]"
                  />
                </div>
                {activeAuthMode === "register-student" ? (
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-[#434651]">Student UID</label>
                    <input
                      type="text"
                      required
                      value={registerUid}
                      onChange={(event) => setRegisterUid(event.target.value)}
                      placeholder="24-COMPD13-28"
                      className="w-full border border-[#747782] p-3 text-sm outline-none focus:border-[#002155]"
                    />
                    <p className="text-[11px] text-[#434651]">UID format: STARTYEAR-BRANCHDIVISIONROLLNO-ENDYEAR</p>
                  </div>
                ) : null}
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-[#434651]">Password</label>
                  <input
                    type="password"
                    required
                    value={registerPassword}
                    onChange={(event) => setRegisterPassword(event.target.value)}
                    className="w-full border border-[#747782] p-3 text-sm outline-none focus:border-[#002155]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={registerLoading}
                className="w-full bg-[#002155] text-white py-3 text-xs font-bold uppercase tracking-[0.3em] hover:bg-[#1a438e] disabled:opacity-70"
              >
                {registerLoading
                  ? "Submitting..."
                  : activeAuthMode === "register-student"
                    ? "Register Student"
                    : "Register Faculty"}
              </button>
            </form>
          )}

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
