"use client";

import Link from "next/link";
import { useState } from "react";

export default function FacilityBookingPage() {
  const [activeRole, setActiveRole] = useState("Faculty");
  const roles = ["Faculty", "Researcher", "PG Student", "External"];

  return (
    <>
      {/* TopNoticeTicker */}
      <div className="bg-[#fd9923] flex items-center px-6 py-2 w-full z-[60] overflow-hidden whitespace-nowrap">
        <span className="font-['Inter'] text-xs font-bold uppercase tracking-wider text-white mr-4 flex-shrink-0">
          🔔 Notice:
        </span>
        <div className="overflow-hidden relative w-full">
          <span className="inline-block animate-[marquee_30s_linear_infinite] text-white font-['Inter'] text-xs font-bold uppercase tracking-wider opacity-90 hover:opacity-100 transition-opacity">
            Latest announcements and updates for TCET Center of Excellence — Facility booking window for Q4 is now open for research scholars.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Latest announcements and updates for TCET Center of Excellence — Facility booking window for Q4 is now open for research scholars.
          </span>
        </div>
      </div>

      {/* TopNavBar */}
      <nav className="bg-[#002155] flex justify-between items-center w-full px-8 py-4 z-50 sticky top-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-white flex items-center justify-center">
            <span className="text-[#002155] font-black text-xl">TC</span>
          </div>
          <span className="text-xl font-bold text-white tracking-tighter">TCET CoE</span>
        </div>
        <div className="hidden md:flex items-center gap-8">
          <Link className="text-white opacity-80 text-xs font-['Inter'] uppercase tracking-[0.05rem] hover:opacity-100 hover:text-[#fd9923] transition-all" href="/">Home</Link>
          <Link className="text-white opacity-80 text-xs font-['Inter'] uppercase tracking-[0.05rem] hover:opacity-100 hover:text-[#fd9923] transition-all" href="/about">About</Link>
          <Link className="text-white opacity-80 text-xs font-['Inter'] uppercase tracking-[0.05rem] hover:opacity-100 hover:text-[#fd9923] transition-all" href="#">Research</Link>
          <Link className="text-white opacity-80 text-xs font-['Inter'] uppercase tracking-[0.05rem] hover:opacity-100 hover:text-[#fd9923] transition-all" href="/laboratory">Laboratory</Link>
          <Link className="text-white opacity-80 text-xs font-['Inter'] uppercase tracking-[0.05rem] hover:opacity-100 hover:text-[#fd9923] transition-all" href="#">Events</Link>
          <Link className="text-white opacity-80 text-xs font-['Inter'] uppercase tracking-[0.05rem] hover:opacity-100 hover:text-[#fd9923] transition-all" href="#">Grants</Link>
          <Link className="text-white opacity-80 text-xs font-['Inter'] uppercase tracking-[0.05rem] hover:opacity-100 hover:text-[#fd9923] transition-all" href="#">News</Link>
          <Link className="text-[#fd9923] font-bold border-b-2 border-[#fd9923] pb-1 text-xs font-['Inter'] uppercase tracking-[0.05rem]" href="/facility-booking">Book Facility</Link>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center border border-[#c4c6d3] bg-white/10 px-3 py-1.5">
            <span className="material-symbols-outlined text-white text-sm">search</span>
            <input
              className="bg-transparent border-none text-white text-xs placeholder:text-white/50 focus:outline-none w-32"
              placeholder="Search Archives..."
              type="text"
            />
          </div>
          <span className="material-symbols-outlined text-white cursor-pointer">menu</span>
        </div>
      </nav>

      {/* Main Content Canvas */}
      <main className="max-w-7xl mx-auto px-8 py-12 min-h-screen">
        {/* Header Section */}
        <header className="mb-12 border-l-4 border-[#002155] pl-6">
          <h1 className="font-headline text-[40px] font-bold tracking-tight text-[#002155] leading-none">
            Research Facility Reservation
          </h1>
          <p className="mt-2 text-[#434651] max-w-2xl font-body">
            Institutional access to advanced laboratories, high-performance computing clusters, and specialized analytical equipment for academic excellence.
          </p>
        </header>

        {/* Stepper Component */}
        <div className="flex flex-wrap items-center gap-8 mb-12 border-b border-[#c4c6d3] pb-6">
          <div className="flex items-center gap-3">
            <span className="font-['Roboto'] font-bold text-[#fd9923]">01 Verify</span>
            <div className="h-px w-8 bg-[#c4c6d3]"></div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-['Roboto'] font-medium text-[#747782]">02 Profile</span>
            <div className="h-px w-8 bg-[#c4c6d3]"></div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-['Roboto'] font-medium text-[#747782]">03 Book</span>
            <div className="h-px w-8 bg-[#c4c6d3]"></div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-['Roboto'] font-medium text-[#747782]">04 Confirm</span>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Left Column: Form Content */}
          <section className="lg:col-span-8 space-y-12">
            {/* Step 1: Verification (Active) */}
            <div className="bg-white border border-[#c4c6d3] p-10">
              <h2 className="font-headline text-2xl font-bold text-[#002155] mb-8">
                Verification of Credentials
              </h2>
              <form className="space-y-8" onSubmit={(e) => e.preventDefault()}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="font-['Inter'] text-xs font-bold uppercase tracking-wider text-[#434651]">
                      Institutional ID Number
                    </label>
                    <input
                      className="w-full bg-white border border-[#747782] focus:border-[#002155] focus:ring-1 focus:ring-[#002155] p-3 text-sm outline-none"
                      placeholder="e.g. TCET-2024-RE-01"
                      type="text"
                      style={{ borderRadius: 0 }}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="font-['Inter'] text-xs font-bold uppercase tracking-wider text-[#434651]">
                      Department
                    </label>
                    <select
                      className="w-full bg-white border border-[#747782] focus:border-[#002155] focus:ring-1 focus:ring-[#002155] p-3 text-sm outline-none"
                      style={{ borderRadius: 0 }}
                    >
                      <option>Computer Engineering</option>
                      <option>Electronics &amp; Telecommunication</option>
                      <option>Information Technology</option>
                      <option>Artificial Intelligence &amp; Data Science</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="font-['Inter'] text-xs font-bold uppercase tracking-wider text-[#434651]">
                    Institutional Role
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {roles.map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setActiveRole(role)}
                        className={`border py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
                          activeRole === role
                            ? "border-[#002155] bg-[#002155] text-white"
                            : "border-[#c4c6d3] text-[#434651] hover:border-[#002155]"
                        }`}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    className="bg-[#002155] text-white px-8 py-4 font-['Inter'] text-sm font-bold uppercase tracking-widest hover:bg-[#1a438e] transition-colors inline-flex items-center gap-2"
                  >
                    Verify &amp; Continue
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Step 3 Preview: Slot Selection */}
            <div className="bg-[#f5f4f0] border border-[#c4c6d3] p-10 opacity-60 pointer-events-none select-none">
              <h2 className="font-headline text-2xl font-bold text-[#002155] mb-8">
                Resource Scheduling
              </h2>
              <div className="space-y-6">
                <div className="flex flex-col gap-2">
                  <label className="font-['Inter'] text-xs font-bold uppercase tracking-wider text-[#434651]">
                    Select Laboratory Facility
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white border border-[#c4c6d3] p-4 flex items-center gap-4">
                      <div className="w-12 h-12 bg-[#efeeea] flex items-center justify-center">
                        <span className="material-symbols-outlined text-[#002155]">biotech</span>
                      </div>
                      <div>
                        <p className="font-bold text-sm">Advanced VLSI Lab</p>
                        <p className="text-[10px] uppercase text-[#434651]">Block A - Room 402</p>
                      </div>
                    </div>
                    <div className="bg-white border-2 border-[#002155] p-4 flex items-center gap-4">
                      <div className="w-12 h-12 bg-[#002155] flex items-center justify-center">
                        <span className="material-symbols-outlined text-white">memory</span>
                      </div>
                      <div>
                        <p className="font-bold text-sm">HPC Cluster Node</p>
                        <p className="text-[10px] uppercase text-[#434651]">Data Center - Floor 2</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <label className="font-['Inter'] text-xs font-bold uppercase tracking-wider text-[#434651]">
                    Available Time Slots
                  </label>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                    {["09:00", "11:00", "13:00", "15:00", "17:00", "19:00"].map((slot) => (
                      <button
                        key={slot}
                        className={`border py-2 text-[10px] font-bold uppercase ${
                          slot === "13:00"
                            ? "bg-[#002155] text-white border-[#002155]"
                            : "border-[#c4c6d3] text-[#1b1c1a]"
                        }`}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Step 4 Preview: Confirmation Example */}
            <div className="bg-white border border-[#c4c6d3] border-l-4 border-l-[#002155] p-10">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <span className="font-['Inter'] text-xs font-bold uppercase tracking-wider text-[#8c4f00]">
                    Draft Booking Confirmed
                  </span>
                  <h2 className="font-headline text-2xl font-bold text-[#002155]">
                    Facility Reservation Summary
                  </h2>
                </div>
                <span className="material-symbols-outlined text-4xl text-[#002155]">verified</span>
              </div>
              <div className="bg-[#efeeea] p-6 mb-8">
                <p className="font-['Inter'] text-[10px] uppercase tracking-[0.1rem] text-[#434651] mb-1">
                  Electronic Booking Reference
                </p>
                <p className="font-headline text-4xl font-extrabold text-[#002155] tracking-tighter">
                  COE-2024-8842-X
                </p>
              </div>
              <div className="grid grid-cols-2 gap-8 text-sm">
                <div>
                  <p className="font-bold text-xs uppercase border-b border-[#c4c6d3] pb-1 mb-2">Resource</p>
                  <p className="font-body italic text-[#434651]">NVIDIA DGX-A100 Research Node</p>
                </div>
                <div>
                  <p className="font-bold text-xs uppercase border-b border-[#c4c6d3] pb-1 mb-2">Date &amp; Time</p>
                  <p className="font-body italic text-[#434651]">Oct 24, 2024 | 13:00 - 17:00</p>
                </div>
              </div>
            </div>
          </section>

          {/* Right Column: Guidelines & Information */}
          <aside className="lg:col-span-4 space-y-8">
            {/* Protocol Box */}
            <div className="bg-[#002155] text-white p-8">
              <h3 className="font-headline text-xl font-bold mb-4">Institutional Protocol</h3>
              <ul className="space-y-4 text-sm opacity-90 font-body">
                <li className="flex gap-3">
                  <span className="material-symbols-outlined text-[#fd9923] flex-shrink-0">priority_high</span>
                  <span>Bookings must be made 48 hours in advance for faculty and 72 hours for students.</span>
                </li>
                <li className="flex gap-3">
                  <span className="material-symbols-outlined text-[#fd9923] flex-shrink-0">priority_high</span>
                  <span>Valid institutional ID card is mandatory for entry to all Center of Excellence zones.</span>
                </li>
                <li className="flex gap-3">
                  <span className="material-symbols-outlined text-[#fd9923] flex-shrink-0">priority_high</span>
                  <span>Users are liable for any physical damage to high-precision instrumentation.</span>
                </li>
              </ul>
            </div>

            {/* Support Contacts */}
            <div className="border border-[#c4c6d3] p-8 bg-white">
              <h3 className="font-['Inter'] text-xs font-bold uppercase tracking-widest text-[#002155] mb-6 border-b-2 border-[#002155] pb-2 inline-block">
                Support Contacts
              </h3>
              <div className="space-y-6">
                <div>
                  <p className="font-bold text-sm">Lab Superintendent</p>
                  <p className="text-xs text-[#434651] italic">coe.support@tcetmumbai.in</p>
                  <p className="text-xs text-[#434651]">+91 22 6730 8000 (Ext: 104)</p>
                </div>
                <div className="pt-4 border-t border-[#c4c6d3]">
                  <p className="font-bold text-sm">System Administrator</p>
                  <p className="text-xs text-[#434651] italic">sysadmin.coe@tcetmumbai.in</p>
                </div>
              </div>
            </div>

            {/* Illustration Card */}
            <div className="relative group h-64 overflow-hidden border border-[#c4c6d3]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="Scientific Laboratory"
                className="w-full h-full object-cover grayscale transition-all duration-500 group-hover:grayscale-0"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuD9CTmBnB8EFYMBkEe_d1lxq4bF0d9XNKTQfPHUzxpGUoYgLoHcpHshKIKmMOI795oftQ9qlNLB1_Y809JXO4Te3M_KwYAyWgDnTdRvkjiZKA-K7XROR-cmk3njb6DcbMFLwutdBZcUMPkOqjUs8on4LQYx_VfuUE91jUQv-sk2rCG0aj3gFg1o4tvzqhdiivP8KGe1JS17-fuMw3Z-F4pfAovQLL9rrrw98pVyhLgVcFedxPunP6iw7KPuLDxrkF9f8dG8ulvL2zM"
              />
              <div className="absolute inset-0 bg-[#002155]/20 group-hover:bg-transparent transition-all"></div>
              <div className="absolute bottom-4 left-4 right-4 bg-white p-4">
                <p className="font-['Inter'] text-[10px] font-bold uppercase tracking-widest text-[#002155]">
                  Featured Facility
                </p>
                <p className="font-headline font-bold text-sm">IoT &amp; Embedded Systems Wing</p>
              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-[#f5f4f0] border-t-4 border-[#002155] w-full mt-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 w-full px-12 py-16 max-w-full">
          <div>
            <h3 className="text-lg font-bold text-[#002155] mb-6 uppercase tracking-widest">Institution</h3>
            <p className="font-body leading-relaxed text-slate-600 mb-6 text-sm">
              Thakur College of Engineering and Technology<br />
              A-Block, Thakur Educational Campus,<br />
              Shyamnarayan Thakur Marg, Thakur Village,<br />
              Kandivali (E), Mumbai - 400101
            </p>
            <div className="flex gap-4">
              <span className="material-symbols-outlined text-[#002155] cursor-pointer">social_leaderboard</span>
              <span className="material-symbols-outlined text-[#002155] cursor-pointer">language</span>
              <span className="material-symbols-outlined text-[#002155] cursor-pointer">description</span>
            </div>
          </div>
          <div>
            <h3 className="text-lg font-bold text-[#002155] mb-6 uppercase tracking-widest">Resources</h3>
            <ul className="space-y-3">
              <li><a className="font-body text-sm text-slate-600 hover:text-[#002155] underline" href="#">Institute Address &amp; NAAC</a></li>
              <li><a className="font-body text-sm text-slate-600 hover:text-[#002155] underline" href="#">Mumbai University</a></li>
              <li><a className="font-body text-sm text-slate-600 hover:text-[#002155] underline" href="#">Quick Links</a></li>
              <li><a className="font-body text-sm text-slate-600 hover:text-[#002155] underline" href="#">Privacy Policy</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-bold text-[#002155] mb-6 uppercase tracking-widest">Connect</h3>
            <div className="bg-white p-6 border border-[#c4c6d3]">
              <p className="text-xs font-bold uppercase tracking-widest mb-4">Inquiry Channel</p>
              <input
                className="w-full border border-[#747782] p-3 text-xs mb-3 outline-none focus:border-[#002155]"
                placeholder="Institutional Email"
                type="email"
                style={{ borderRadius: 0 }}
              />
              <button className="w-full bg-[#002155] text-white py-3 font-bold uppercase text-[10px] tracking-widest hover:bg-[#1a438e] transition-colors">
                Submit Request
              </button>
            </div>
          </div>
        </div>
        <div className="bg-[#002155] py-6 px-12 flex justify-between items-center text-white/70 text-[10px] font-bold uppercase tracking-widest">
          <span>© 2024 TCET Center of Excellence. All Rights Reserved.</span>
          <div className="flex gap-8">
            <a className="hover:text-white transition-colors" href="#">Accessibility</a>
            <a className="hover:text-white transition-colors" href="#">Legal Archives</a>
          </div>
        </div>
      </footer>
    </>
  );
}