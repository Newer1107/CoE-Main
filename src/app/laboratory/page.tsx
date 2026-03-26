"use client";

import Link from "next/link";
import { useState } from "react";

export default function LaboratoryPage() {
  const [activeFilter, setActiveFilter] = useState("All Equipment");

  const filters = ["All Equipment", "Electronics", "Computing", "Fabrication"];

  return (
    <>
      {/* TopNoticeTicker */}
      <div className="bg-[#fd9923] flex items-center px-6 py-2 w-full z-[60] fixed top-0 border-none font-['Inter'] text-xs font-bold uppercase tracking-wider text-white overflow-hidden whitespace-nowrap">
        <span className="mr-4 flex-shrink-0">🔔 Notice:</span>
        <div className="overflow-hidden w-full">
          <span className="inline-block animate-[marquee_30s_linear_infinite]">
            Latest announcements and updates for TCET Center of Excellence — New Lab Equipment Procurement for FY 2024-25 — Grant Application Window Closing Soon.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Latest announcements and updates for TCET Center of Excellence — New Lab Equipment Procurement for FY 2024-25 — Grant Application Window Closing Soon.
          </span>
        </div>
      </div>

      {/* TopNavBar */}
      <header className="bg-[#002155] flex justify-between items-center w-full px-8 py-4 z-50 fixed top-[32px] border-none">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-white tracking-tighter uppercase font-['Inter']">TCET CoE</h1>
        </div>
        <nav className="hidden md:flex items-center gap-8">
          <Link className="text-white opacity-80 hover:opacity-100 hover:text-[#fd9923] transition-all text-xs font-['Inter'] uppercase tracking-[0.05rem]" href="/">Home</Link>
          <Link className="text-white opacity-80 hover:opacity-100 hover:text-[#fd9923] transition-all text-xs font-['Inter'] uppercase tracking-[0.05rem]" href="/about">About</Link>
          <Link className="text-white opacity-80 hover:opacity-100 hover:text-[#fd9923] transition-all text-xs font-['Inter'] uppercase tracking-[0.05rem]" href="#">Research</Link>
          <Link className="text-[#fd9923] font-bold border-b-2 border-[#fd9923] pb-1 text-xs font-['Inter'] uppercase tracking-[0.05rem]" href="/laboratory">Laboratory</Link>
          <Link className="text-white opacity-80 hover:opacity-100 hover:text-[#fd9923] transition-all text-xs font-['Inter'] uppercase tracking-[0.05rem]" href="#">Events</Link>
          <Link className="text-white opacity-80 hover:opacity-100 hover:text-[#fd9923] transition-all text-xs font-['Inter'] uppercase tracking-[0.05rem]" href="#">Grants</Link>
          <Link className="text-white opacity-80 hover:opacity-100 hover:text-[#fd9923] transition-all text-xs font-['Inter'] uppercase tracking-[0.05rem]" href="#">News</Link>
          <Link className="bg-[#8c4f00] px-4 py-2 text-white font-['Inter'] text-[10px] font-black uppercase tracking-widest hover:bg-[#6b3b00] transition-colors" href="/facility-booking">Book Facility</Link>
        </nav>
        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center border border-[#747782] px-3 py-1 bg-[#003580]">
            <span className="material-symbols-outlined text-white text-sm">search</span>
            <input
              className="bg-transparent border-none text-[10px] text-white placeholder:text-white/50 focus:outline-none w-32 font-['Inter'] uppercase"
              placeholder="SEARCH ARCHIVES..."
              type="text"
            />
          </div>
        </div>
      </header>

      <main className="pt-[80px] pb-20 max-w-7xl mx-auto px-8">
        {/* Hero Section */}
        <section className="mb-16 border-l-4 border-[#002155] pl-8 py-4 mt-8">
          <h2 className="text-[40px] font-headline tracking-tight leading-none mb-4">Laboratory Infrastructure &amp; Research Facilities</h2>
          <p className="max-w-3xl text-lg text-[#434651] font-body leading-relaxed">
            The TCET Center of Excellence houses state-of-the-art computational and experimental environments designed for high-impact multidisciplinary research. Our facilities serve as the bedrock for innovation in Electronics, Fabrication, and Advanced Computing.
          </p>
        </section>

        {/* Equipment Filter */}
        <section className="mb-12">
          <div className="flex flex-wrap gap-1 border-b border-[#c4c6d3] pb-px">
            {filters.map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`px-8 py-3 font-['Inter'] text-xs font-bold uppercase tracking-wider transition-all ${
                  activeFilter === filter
                    ? "bg-[#002155] text-white"
                    : "bg-[#e9e8e4] text-[#434651] hover:bg-[#e3e2df]"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </section>

        {/* Equipment Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border-t border-l border-[#c4c6d3] mb-20">
          {/* Equipment Item 1 */}
          <div className="border-r border-b border-[#c4c6d3] p-6 bg-white">
            <div className="aspect-video mb-6 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="w-full h-full object-cover grayscale-img"
                alt="High-precision digital oscilloscope on a clean laboratory workbench"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBhoT1SdZZYyvVB7pZ01EbLd_ybTFnomxautcchnI1YaNhLR3ATcfvIk9rV_S0DzDLTYVJBfS3q_AtaAQPzCdMRt2iMks5Pf9nld3T9Tna1dEs5FIs4LAmEbSWN31CXyxxrUWvLPbOpjmdr6TDlSAZ5mKLdocKNhqmUPm1bGP74NgLeT4KtcwxTEv3ca8TB9dwOGrGyx0vxHtR4n7DIZCp1yxPtq4ssjOdaSI2uQrJIUQRk36efMx5tLkd-E-JDOOKl1iRW5wZuw-M"
              />
            </div>
            <h3 className="font-headline font-bold text-2xl mb-2 italic">DSOX3024T Digital Storage Oscilloscope</h3>
            <p className="text-sm font-['Inter'] text-[#8c4f00] font-bold uppercase mb-4 tracking-tighter">Electronics / Signal Analysis</p>
            <div className="space-y-2 text-sm text-[#434651] border-t border-[#c4c6d3] pt-4">
              <div className="flex justify-between"><span>Bandwidth:</span><span className="font-semibold text-[#1b1c1a]">200 MHz</span></div>
              <div className="flex justify-between"><span>Channels:</span><span className="font-semibold text-[#1b1c1a]">4 Analog + 16 Digital</span></div>
              <div className="flex justify-between"><span>Sample Rate:</span><span className="font-semibold text-[#1b1c1a]">5 GSa/s</span></div>
            </div>
          </div>

          {/* Equipment Item 2 */}
          <div className="border-r border-b border-[#c4c6d3] p-6 bg-white">
            <div className="aspect-video mb-6 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="w-full h-full object-cover grayscale-img"
                alt="Powerful server rack in a dark room with blue status lights"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAtZsCIDkxEcZaGGO4P6OhC7AEkY-d9qnaeizUsxOcMWqMcxN-xyWoxn9wl3vhFlw7a0mkLdZQGL6-7Ayk6yyQ0EdcA-Bd-osNCUkMVat6K68bnu2LP_uxvOXw4VOq5dZrnovEslGpF4MTyAuiK9JuLrzk3Le_ea7AZlcT5Fo7_1X6CRHh2C5_FVPtT4s9Tpi2l57VSlmAYRlgexhBbDJt1vD5g7YwZHYH8DNxhrLt0cJGWqjKY3XhDm3FiDEvGuRaz1jrg0-DhKyg"
              />
            </div>
            <h3 className="font-headline font-bold text-2xl mb-2 italic">NVIDIA DGX Station A100</h3>
            <p className="text-sm font-['Inter'] text-[#8c4f00] font-bold uppercase mb-4 tracking-tighter">Computing / AI &amp; ML</p>
            <div className="space-y-2 text-sm text-[#434651] border-t border-[#c4c6d3] pt-4">
              <div className="flex justify-between"><span>GPU Memory:</span><span className="font-semibold text-[#1b1c1a]">320 GB Total</span></div>
              <div className="flex justify-between"><span>Performance:</span><span className="font-semibold text-[#1b1c1a]">2.5 PetaFLOPS AI</span></div>
              <div className="flex justify-between"><span>CUDA Cores:</span><span className="font-semibold text-[#1b1c1a]">27,648</span></div>
            </div>
          </div>

          {/* Equipment Item 3 */}
          <div className="border-r border-b border-[#c4c6d3] p-6 bg-white">
            <div className="aspect-video mb-6 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="w-full h-full object-cover grayscale-img"
                alt="Industrial 3D printer extruding precision mechanical parts"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuB44-P8e82oNHPGyeEsbnTLJwJtu0QaE4W3EISMUQ1TgKDD3_uy5fvTcbL0IoVHwHUbriSb3j_M19Az1MNjSQetFn0One6JXleY_uNffATgM4w-sQC9MqCLXaFJD5l-UOwlfbdRixYQJmkHr75iKNSKXNuawvFoNikDWIgfsFJWPyLfc0spohHeQ6m9Fc7obCAch7V7upesoFZydIVrp-vv9tFLGALZLDwBPQEo5kvpuZRHsu3Ai0Em8-y3pQo3P2-5GdWftkGL0DU"
              />
            </div>
            <h3 className="font-headline font-bold text-2xl mb-2 italic">Ultimaker S5 Pro Bundle</h3>
            <p className="text-sm font-['Inter'] text-[#8c4f00] font-bold uppercase mb-4 tracking-tighter">Fabrication / Prototyping</p>
            <div className="space-y-2 text-sm text-[#434651] border-t border-[#c4c6d3] pt-4">
              <div className="flex justify-between"><span>Build Volume:</span><span className="font-semibold text-[#1b1c1a]">330 x 240 x 300 mm</span></div>
              <div className="flex justify-between"><span>Layer Resolution:</span><span className="font-semibold text-[#1b1c1a]">20 Microns</span></div>
              <div className="flex justify-between"><span>Feeder:</span><span className="font-semibold text-[#1b1c1a]">Dual Extrusion</span></div>
            </div>
          </div>
        </section>

        {/* Facilities List */}
        <section className="mb-8">
          <div className="flex items-center gap-4 mb-8">
            <div className="h-[1px] flex-grow bg-[#c4c6d3]"></div>
            <h2 className="text-sm font-['Inter'] font-black uppercase tracking-[0.2em] text-[#002155]">Specialized Research Facilities</h2>
            <div className="h-[1px] flex-grow bg-[#c4c6d3]"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-4">
            {[
              "Advanced VLSI Design Center",
              "Cyber-Physical Systems Lab",
              "Center for Embedded Systems & IoT",
              "Digital Signal Processing Unit",
              "Microwave Engineering Laboratory",
              "Robotics & Automation Hub",
              "Cloud Computing & Big Data Lab",
              "Renewable Energy Systems Cell",
            ].map((facility) => (
              <div key={facility} className="flex justify-between py-3 border-b border-[#c4c6d3]">
                <span className="font-headline italic text-lg text-[#002155]">{facility}</span>
                <span className="material-symbols-outlined text-[#747782]">chevron_right</span>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#f5f4f0] text-[#002155] border-t-4 border-[#002155] mt-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 w-full px-12 py-16 max-w-full">
          <div className="space-y-6">
            <div className="text-lg font-bold text-[#002155] uppercase font-['Inter']">TCET Center of Excellence</div>
            <p className="font-body leading-relaxed opacity-80 text-sm">
              Thakur College of Engineering and Technology,<br />
              A-Block, Thakur Educational Campus,<br />
              Shyamnarayan Thakur Marg, Thakur Village,<br />
              Kandivali (E), Mumbai - 400101.
            </p>
            <div className="flex gap-4">
              <span className="material-symbols-outlined">location_on</span>
              <span className="material-symbols-outlined">mail</span>
              <span className="material-symbols-outlined">phone</span>
            </div>
          </div>
          <div className="space-y-6">
            <h4 className="text-sm font-black uppercase tracking-widest border-b border-[#c4c6d3] pb-2">Institutional Links</h4>
            <ul className="space-y-3 text-sm font-body">
              <li><a className="text-slate-600 hover:text-[#002155] underline transition-colors" href="#">Institute Address &amp; NAAC</a></li>
              <li><a className="text-slate-600 hover:text-[#002155] underline transition-colors" href="#">Mumbai University</a></li>
              <li><a className="text-slate-600 hover:text-[#002155] underline transition-colors" href="#">Quick Links</a></li>
              <li><a className="text-slate-600 hover:text-[#002155] underline transition-colors" href="#">Privacy Policy</a></li>
            </ul>
          </div>
          <div className="space-y-6">
            <h4 className="text-sm font-black uppercase tracking-widest border-b border-[#c4c6d3] pb-2">Facility Access</h4>
            <p className="text-sm font-body leading-relaxed opacity-80 mb-4">
              Researchers and students from external institutions can apply for facility usage through our centralized booking system.
            </p>
            <Link className="inline-block bg-[#002155] text-white px-6 py-2 font-['Inter'] text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-opacity" href="/facility-booking">
              Request Lab Access
            </Link>
          </div>
        </div>
        <div className="bg-[#002155] py-4 px-12 text-white/60 text-[10px] font-['Inter'] uppercase tracking-widest flex justify-between items-center">
          <span>© 2024 TCET Center of Excellence. All Rights Reserved.</span>
          <button
            className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            Back to Top <span className="material-symbols-outlined text-xs">arrow_upward</span>
          </button>
        </div>
      </footer>
    </>
  );
}