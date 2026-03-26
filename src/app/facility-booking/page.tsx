"use client";

import { useEffect, useState } from "react";

export default function FacilityBookingPage() {
  const [step, setStep] = useState(1);
  const [checkingSession, setCheckingSession] = useState(true);
  const [isLogin, setIsLogin] = useState(true);
  
  // Auth Form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [uid, setUid] = useState("");
  const [role, setRole] = useState("STUDENT"); // STUDENT or FACULTY
  
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  // Form State
  const [purpose, setPurpose] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [lab, setLab] = useState("");
  const [equipment, setEquipment] = useState<string[]>([]);
  
  // Booking result
  const [bookingRef, setBookingRef] = useState("");
  
  const availableLabs = [
    "Research Culture Development Room 701",
    "Industrial IoT & OT Room 213",
    "Robotics & Automation Room 010",
  ];

  const labEquipmentMap: Record<string, string[]> = {
    "Research Culture Development Room 701": [
      "Workstation",
      "Computer",
      "Deployable server",
      "AI computing server",
      "Projector & whiteboard",
    ],
    "Industrial IoT & OT Room 213": [
      "PLC training rack (mock)",
      "IoT sensor bench (mock)",
      "Edge gateway demo kit (mock)",
      "SCADA simulator (mock)",
    ],
    "Robotics & Automation Room 010": [
      "6-axis robot demo cell (mock)",
      "Conveyor automation rig (mock)",
      "Vision inspection station (mock)",
      "Safety light curtain (mock)",
    ],
  };

  const availableEquipment = lab ? labEquipmentMap[lab] ?? [] : [];
  const timeSlots = ["09:00 - 11:00", "11:00 - 13:00", "13:00 - 15:00", "15:00 - 17:00", "17:00 - 19:00"];

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch("/api/bookings/my", {
          method: "GET",
          credentials: "include",
        });

        if (res.ok) {
          setStep(3);
          setAuthSuccess("Active session found. You can continue booking.");
        }
      } catch {
        // Ignore network/session check failures and keep login step.
      } finally {
        setCheckingSession(false);
      }
    };

    void checkSession();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Even if logout request fails, reset local UI state.
    }

    setStep(1);
    setAuthSuccess("Logged out successfully.");
    setAuthError("");
    setEmail("");
    setPassword("");
  };

  if (checkingSession) {
    return (
      <main className="max-w-7xl mx-auto px-4 md:px-8 pt-[120px] pb-12 min-h-screen">
        <div className="border border-[#c4c6d3] bg-white p-6 md:p-8">
          <p className="text-sm text-[#434651]">Checking your session...</p>
        </div>
      </main>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
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
        if (data.needsVerification) {
          // Trigger OTP resend and switch view
          await fetch("/api/auth/resend-otp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
          });
          setIsLogin(false);
          setRole("STUDENT");
          setOtpSent(true);
          setAuthSuccess("OTP resent to your email. Please verify to login.");
          return;
        }
        throw new Error(data.message || "Login failed");
      }
      
      // Successfully logged in (Cookie is set), skip to booking
      setStep(3);
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");
    setLoading(true);
    try {
      if (role === "STUDENT") {
        const res = await fetch("/api/auth/register/student", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name, phone, uid })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Registration failed");
        setOtpSent(true);
        setAuthSuccess("OTP sent to your email!");
      } else {
        const res = await fetch("/api/auth/register/faculty", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name, phone })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Registration failed");
        setAuthSuccess("Registration successful! Your account is pending admin approval.");
        setEmail(""); setPassword(""); setName(""); setPhone("");
        setTimeout(() => setIsLogin(true), 3000);
      }
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "OTP Verification failed");
      setAuthSuccess("Email verified! You can now log in.");
      setOtpSent(false);
      setIsLogin(true);
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setLoading(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({
          purpose,
          date,
          timeSlot: time,
          lab,
          facilities: equipment
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Booking failed");
      
      setBookingRef(`COE-2024-${data.data.id}-B`);
      setStep(4);
    } catch (err: any) {
      setAuthError(err.message);
      alert("Booking Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEquipment = (item: string) => {
    if (equipment.includes(item)) {
      setEquipment(equipment.filter(e => e !== item));
    } else {
      setEquipment([...equipment, item]);
    }
  };

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-8 pt-[120px] pb-12 min-h-screen">
      {/* Header Section */}
      <header className="mb-8 md:mb-12 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-[#002155] leading-none">
          Research Facility Reservation
        </h1>
        <p className="mt-2 text-[#434651] max-w-2xl font-body">
          Institutional access to advanced laboratories, high-performance computing clusters, and specialized analytical equipment for academic excellence.
        </p>
      </header>

      {/* Stepper Component */}
      <div className="flex flex-wrap items-center gap-4 mb-8 md:mb-12 border-b border-[#c4c6d3] pb-6">
        <div className="flex items-center gap-3">
          <span className={`font-['Roboto'] font-bold ${step >= 1 ? "text-[#fd9923]" : "text-[#747782]"}`}>01 Identity</span>
          <div className={`h-px w-8 ${step >= 3 ? "bg-[#fd9923]" : "bg-[#c4c6d3]"}`}></div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`font-['Roboto'] font-bold ${step >= 3 ? "text-[#fd9923]" : "text-[#747782]"}`}>02 Book</span>
          <div className={`h-px w-8 ${step >= 4 ? "bg-[#fd9923]" : "bg-[#c4c6d3]"}`}></div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`font-['Roboto'] font-bold ${step >= 4 ? "text-[#002155]" : "text-[#747782]"}`}>03 Confirm</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <section className="lg:col-span-8 space-y-12">
          
          {/* STEP 1: AUTH (Login or Register) */}
          {step === 1 && (
            <div className="bg-white border border-[#c4c6d3] p-6 md:p-10 animate-fade-in">
              <div className="flex justify-between items-center mb-6 border-b pb-4">
                <h2 className="font-headline text-2xl font-bold text-[#002155]">
                  {isLogin ? "Institutional Login" : "Register Profile"}
                </h2>
                <button 
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-xs font-bold uppercase tracking-widest text-[#002155] hover:underline"
                >
                  {isLogin ? "Create Account" : "Back to Login"}
                </button>
              </div>

              {authError && <p className="mb-4 text-red-600 bg-red-50 p-3 text-sm">{authError}</p>}
              {authSuccess && <p className="mb-4 text-green-700 bg-green-50 p-3 text-sm">{authSuccess}</p>}
              
              {isLogin ? (
                // --- LOGIN FORM ---
                <form className="space-y-6 max-w-md" onSubmit={handleLogin}>
                  <div className="flex flex-col gap-2">
                    <label className="font-['Inter'] text-xs font-bold uppercase tracking-wider text-[#434651]">Institutional Email</label>
                    <input
                      className="w-full bg-white border border-[#747782] focus:border-[#002155] focus:ring-1 p-3 text-sm outline-none placeholder:text-[#c4c6d3]"
                      placeholder="aditya.shah@tcetmumbai.in" type="email" value={email} onChange={e => setEmail(e.target.value)} required style={{ borderRadius: 0 }}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="font-['Inter'] text-xs font-bold uppercase tracking-wider text-[#434651]">Password</label>
                    <input
                      className="w-full bg-white border border-[#747782] focus:border-[#002155] focus:ring-1 p-3 text-sm outline-none"
                      type="password" value={password} onChange={e => setPassword(e.target.value)} required style={{ borderRadius: 0 }}
                    />
                  </div>
                  <button type="submit" disabled={loading} className="bg-[#002155] w-full text-white px-6 py-4 font-['Inter'] text-sm font-bold uppercase disabled:bg-opacity-70 hover:bg-[#1a438e] transition-colors">
                    {loading ? "Authenticating..." : "Login to Book"}
                  </button>
                </form>
              ) : !otpSent ? (
                // --- REGISTER FORM ---
                <form className="space-y-6 max-w-lg" onSubmit={handleRegister}>
                  <div className="grid grid-cols-2 gap-4">
                    <button type="button" onClick={() => setRole("STUDENT")} className={`border p-3 text-xs font-bold uppercase tracking-widest text-[#434651] border-[#002155] hover:border-[#002155] transition-all flex items-center justify-between ${role === "STUDENT" ? "border-[#002155] bg-[#002155] text-white" : ""}`}> Student {role === "STUDENT" && <span className="material-symbols-outlined text-sm">check_circle</span>} </button>
                    <button type="button" onClick={() => setRole("FACULTY")} className={`border p-3 text-xs font-bold uppercase tracking-widest text-[#434651] border-[#c4c6d3] hover:border-[#002155] transition-all flex items-center justify-between ${role === "FACULTY" ? "border-[#002155] bg-[#002155] text-white" : ""}`}> Faculty {role === "FACULTY" && <span className="material-symbols-outlined text-sm">check_circle</span>} </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="font-['Inter'] text-xs font-bold uppercase tracking-wider text-[#434651]">Full Name</label>
                      <input className="w-full bg-white border border-[#747782] p-3 text-sm outline-none" type="text" value={name} onChange={e => setName(e.target.value)} required style={{ borderRadius: 0 }} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="font-['Inter'] text-xs font-bold uppercase tracking-wider text-[#434651]">Institutional Email</label>
                      <input className="w-full bg-white border border-[#747782] p-3 text-sm outline-none" type="email" value={email} onChange={e => setEmail(e.target.value)} required style={{ borderRadius: 0 }} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="font-['Inter'] text-xs font-bold uppercase tracking-wider text-[#434651]">Phone (+91)</label>
                      <input className="w-full bg-white border border-[#747782] p-3 text-sm outline-none" type="text" value={phone} onChange={e => setPhone(e.target.value)} required style={{ borderRadius: 0 }} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="font-['Inter'] text-xs font-bold uppercase tracking-wider text-[#434651]">Password</label>
                      <input className="w-full bg-white border border-[#747782] p-3 text-sm outline-none" type="password" value={password} onChange={e => setPassword(e.target.value)} required style={{ borderRadius: 0 }} />
                    </div>
                    {role === "STUDENT" && (
                      <div className="flex flex-col gap-2 md:col-span-2">
                        <label className="font-['Inter'] text-xs font-bold uppercase tracking-wider text-[#434651]">TCET UID</label>
                        <input className="w-full bg-white border border-[#747782] p-3 text-sm outline-none" placeholder="e.g. 12345" type="text" value={uid} onChange={e => setUid(e.target.value)} required style={{ borderRadius: 0 }} />
                      </div>
                    )}
                  </div>
                  <button type="submit" disabled={loading} className="bg-[#002155] w-full text-white px-6 py-4 font-['Inter'] text-sm font-bold uppercase disabled:bg-opacity-70">
                    {loading ? "Processing..." : (role === "STUDENT" ? "Send Verification OTP" : "Submit Request")}
                  </button>
                </form>
              ) : (
                // --- OTP FORM ---
                <form className="space-y-6 max-w-md" onSubmit={handleVerifyOtp}>
                  <div className="p-4 bg-[#f5f4f0] border border-[#c4c6d3] mb-6 flex items-start gap-3">
                    <span className="material-symbols-outlined text-[#8c4f00] text-xl">mark_email_read</span>
                    <div>
                      <p className="text-xs font-bold text-[#002155] uppercase font-['Inter']">OTP Sent</p>
                      <p className="text-xs text-[#434651]">A secure code has been sent to {email}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="font-['Inter'] text-xs font-bold uppercase tracking-wider text-[#434651]">Enter 6-Digit OTP</label>
                    <input className="w-full bg-white border border-[#747782] p-4 text-center text-xl tracking-[0.5em] outline-none font-bold" type="text" maxLength={6} value={otp} onChange={e => setOtp(e.target.value)} required style={{ borderRadius: 0 }} />
                  </div>
                  <div className="flex gap-4">
                    <button type="button" onClick={() => setOtpSent(false)} className="border border-[#c4c6d3] text-[#434651] px-6 py-4 font-['Inter'] text-sm font-bold uppercase">Back</button>
                    <button type="submit" disabled={loading} className="bg-[#002155] flex-grow text-white px-6 py-4 font-['Inter'] text-sm font-bold uppercase disabled:bg-opacity-70">Verify</button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* STEP 3: BOOKING FORM */}
          {step === 3 && (
            <div className="bg-white border border-[#c4c6d3] p-6 md:p-10 animate-fade-in shadow-sm">
              <div className="flex justify-between items-center mb-8 border-b border-gray-200 pb-4">
                <h2 className="font-headline text-2xl font-bold text-[#002155]">
                  Resource Scheduling
                </h2>
                <div className="flex gap-4 items-center">
                  <span className="text-[10px] font-['Inter'] font-bold text-[#8c4f00] uppercase tracking-widest bg-[#f5f4f0] px-3 py-1 border border-[#c4c6d3]">Authenticated</span>
                  <button onClick={handleLogout} className="text-xs uppercase text-red-600 font-bold hover:underline">Logout</button>
                </div>
              </div>
              
              <form className="space-y-8" onSubmit={handleSubmitBooking}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="font-['Inter'] text-xs font-bold uppercase tracking-wider text-[#434651]">Target Laboratory <span className="text-red-500">*</span></label>
                    <select
                      className="w-full bg-white border border-[#747782] p-3 text-sm outline-none"
                      value={lab}
                      onChange={(e) => {
                        setLab(e.target.value);
                        setEquipment([]);
                      }}
                      required
                      style={{ borderRadius: 0 }}
                    >
                      <option value="" disabled>Select a facility...</option>
                      {availableLabs.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="font-['Inter'] text-xs font-bold uppercase tracking-wider text-[#434651]">Date of Visit <span className="text-red-500">*</span></label>
                    <input type="date" className="w-full bg-white border border-[#747782] p-3 text-sm outline-none" value={date} onChange={(e) => setDate(e.target.value)} required style={{ borderRadius: 0 }} />
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="font-['Inter'] text-xs font-bold uppercase tracking-wider text-[#434651]">Preferred Time Slot <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                    {timeSlots.map((slot) => (
                      <button key={slot} type="button" onClick={() => setTime(slot)} className={`border py-3 text-[11px] font-bold uppercase transition-colors ${time === slot ? "bg-[#002155] text-white border-[#002155]" : "border-[#c4c6d3] text-[#1b1c1a] hover:border-[#002155] bg-[#f5f4f0]"}`}>
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="font-['Inter'] text-xs font-bold uppercase tracking-wider text-[#434651]">Required Equipment (Optional)</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {availableEquipment.map((eq) => (
                      <label key={eq} className={`flex items-center gap-3 p-3 border cursor-pointer transition-colors ${equipment.includes(eq) ? 'border-[#002155] bg-blue-50/10' : 'border-[#c4c6d3] hover:bg-[#f5f4f0]'}`}>
                        <input type="checkbox" checked={equipment.includes(eq)} onChange={() => handleToggleEquipment(eq)} className="w-4 h-4 accent-[#002155] rounded-none outline-none border-[#747782]" style={{ borderRadius: 0 }} />
                        <span className={`text-sm ${equipment.includes(eq) ? 'font-bold text-[#002155]' : 'font-medium text-[#434651]'}`}>{eq}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="font-['Inter'] text-xs font-bold uppercase tracking-wider text-[#434651]">Purpose of Research / Visit <span className="text-red-500">*</span></label>
                  <textarea className="w-full bg-white border border-[#747782] p-4 text-sm outline-none resize-none min-h-[120px]" placeholder="Briefly describe the research activity, related grant, or academic purpose." value={purpose} onChange={(e) => setPurpose(e.target.value)} required style={{ borderRadius: 0 }}></textarea>
                </div>

                <div className="pt-8 flex justify-end items-center border-t border-[#c4c6d3]">
                  <button type="submit" disabled={!lab || !date || !time || !purpose || loading} className="bg-[#002155] disabled:bg-[#c4c6d3] disabled:cursor-not-allowed text-white px-8 py-4 font-['Inter'] text-sm font-bold uppercase tracking-widest hover:bg-[#1a438e] transition-colors inline-flex items-center gap-2">
                    {loading ? "Submitting..." : "Submit Booking"}
                    <span className="material-symbols-outlined text-sm">send</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* STEP 4: CONFIRMATION */}
          {step === 4 && (
            <div className="bg-white border border-[#c4c6d3] border-t-8 border-t-[#002155] p-8 md:p-12 text-center animate-fade-in shadow-lg">
              <div className="w-20 h-20 bg-[#efeef0] text-[#002155] rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="material-symbols-outlined text-4xl">inventory_2</span>
              </div>
              <h2 className="font-headline text-3xl font-bold text-[#002155] mb-2">Booking Sent for Approval</h2>
              <p className="font-['Inter'] text-xs font-bold uppercase tracking-widest text-[#fd9923] mb-8">
                Reference ID: <span className="text-[#002155] underline">{bookingRef}</span>
              </p>
              
              <div className="bg-[#f5f4f0] border border-[#c4c6d3] p-6 text-left max-w-lg mx-auto mb-8 space-y-4">
                <div className="grid grid-cols-3 gap-2 border-b border-[#c4c6d3] pb-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-[#747782] col-span-1">Visitor</p>
                  <p className="text-sm font-bold text-[#002155] col-span-2">{email} (STUDENT)</p>
                </div>
                <div className="grid grid-cols-3 gap-2 border-b border-[#c4c6d3] pb-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-[#747782] col-span-1">Facility</p>
                  <p className="text-sm font-bold text-[#002155] col-span-2">{lab}</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-[#747782] col-span-1">Schedule</p>
                  <p className="text-sm font-bold text-[#002155] col-span-2">{date} <br/> <span className="text-xs font-normal">{time}</span></p>
                </div>
              </div>

              <p className="text-sm text-[#434651] font-body mb-8 px-4">
                Your request has been forwarded to the Laboratory Superintendent. You will receive an email notification upon clearance from the administration.
              </p>

              <button onClick={() => { setStep(3); setPurpose(""); setEquipment([]); setDate(""); setTime(""); setLab(""); }} className="bg-transparent border-2 border-[#002155] text-[#002155] px-8 py-3 font-['Inter'] text-xs font-bold uppercase hover:bg-[#002155] hover:text-white transition-colors">
                Book Another Session
              </button>
            </div>
          )}
        </section>

        {/* Right Column: Guidelines */}
        <aside className="lg:col-span-4 space-y-6 md:space-y-8 h-fit lg:sticky lg:top-[120px]">
          <div className="bg-[#002155] text-white p-6 md:p-8">
            <h3 className="font-headline text-xl font-bold mb-4">Institutional Protocol</h3>
            <ul className="space-y-4 text-xs lg:text-sm opacity-90 font-body">
              <li className="flex gap-3"><span className="material-symbols-outlined text-[#fd9923] flex-shrink-0 text-lg">priority_high</span><span>Bookings must be made 48 hours for faculty and 72 hours for students.</span></li>
              <li className="flex gap-3"><span className="material-symbols-outlined text-[#fd9923] flex-shrink-0 text-lg">admin_panel_settings</span><span>Only verified users with @tcetmumbai.in domain are granted automated initial clearance.</span></li>
              <li className="flex gap-3"><span className="material-symbols-outlined text-[#fd9923] flex-shrink-0 text-lg">gavel</span><span>Users are strictly liable for any physical damage to high-precision instrumentation.</span></li>
            </ul>
          </div>

          <div className="border border-[#c4c6d3] p-6 md:p-8 bg-white shadow-sm">
            <h3 className="font-['Inter'] text-[10px] md:text-xs font-bold uppercase tracking-widest text-[#002155] mb-5 border-b-2 border-[#002155] pb-2 inline-block">Immediate Support</h3>
            <div className="space-y-5">
              <div>
                <p className="font-bold text-sm text-[#002155]">Lab Superintendent</p>
                <p className="text-[11px] md:text-xs text-[#434651] italic">coe.support@tcetmumbai.in</p>
                <p className="text-[11px] md:text-xs font-bold text-[#8c4f00] mt-1">+91 22 6730 8000 (Ext: 104)</p>
              </div>
              <div className="pt-4 border-t border-[#dbdad6]">
                <p className="font-bold text-sm text-[#002155]">System Administrator</p>
                <p className="text-[11px] md:text-xs text-[#434651] italic">sysadmin.coe@tcetmumbai.in</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}