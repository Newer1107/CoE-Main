"use client";

import Link from "next/link";

export default function AboutPage() {
  return (
    <>
      {/* TopNoticeTicker */}
      <div className="bg-[#fd9923] font-['Inter'] text-xs font-bold uppercase tracking-wider text-white flex items-center px-6 py-2 w-full z-[60] fixed top-0 border-none overflow-hidden whitespace-nowrap">
        <span className="mr-4 flex-shrink-0">🔔 Notice:</span>
        <div className="overflow-hidden w-full">
          <span className="inline-block animate-[marquee_30s_linear_infinite]">
            Latest announcements and updates for TCET Center of Excellence&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Latest announcements and updates for TCET Center of Excellence
          </span>
        </div>
      </div>

      {/* TopNavBar */}
      <header className="bg-[#002155] flex justify-between items-center w-full px-8 py-4 z-50 fixed top-[32px] border-none">
        <div className="text-xl font-bold text-white tracking-tighter">TCET CoE</div>
        <nav className="hidden md:flex space-x-6 items-center">
          <Link className="text-white opacity-80 hover:opacity-100 hover:text-[#fd9923] transition-all text-xs font-['Inter'] uppercase tracking-[0.05rem]" href="/">Home</Link>
          <Link className="text-[#fd9923] font-bold border-b-2 border-[#fd9923] pb-1 text-xs font-['Inter'] uppercase tracking-[0.05rem]" href="/about">About</Link>
          <Link className="text-white opacity-80 hover:opacity-100 hover:text-[#fd9923] transition-all text-xs font-['Inter'] uppercase tracking-[0.05rem]" href="#">Research</Link>
          <Link className="text-white opacity-80 hover:opacity-100 hover:text-[#fd9923] transition-all text-xs font-['Inter'] uppercase tracking-[0.05rem]" href="/laboratory">Laboratory</Link>
          <Link className="text-white opacity-80 hover:opacity-100 hover:text-[#fd9923] transition-all text-xs font-['Inter'] uppercase tracking-[0.05rem]" href="#">Events</Link>
          <Link className="text-white opacity-80 hover:opacity-100 hover:text-[#fd9923] transition-all text-xs font-['Inter'] uppercase tracking-[0.05rem]" href="#">Grants</Link>
          <Link className="text-white opacity-80 hover:opacity-100 hover:text-[#fd9923] transition-all text-xs font-['Inter'] uppercase tracking-[0.05rem]" href="#">News</Link>
          <Link className="bg-[#8c4f00] px-4 py-2 text-white text-xs font-['Inter'] uppercase tracking-[0.05rem] hover:bg-[#6b3b00] transition-colors" href="/facility-booking">Book Facility</Link>
        </nav>
        <div className="flex items-center space-x-4">
          <span className="material-symbols-outlined text-white cursor-pointer">search</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="TCET and CoE Institutional Logos"
            className="w-10 h-10 object-contain"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuCWclOSZf9-eROywznZyd31Vx-n44WlqaleNtBLeeAQWkmzKxB_zYHmYcDvjW6YgZSl3TXBXbhepVKSe8jNDlvRroGALlXISU8rVXbrQVMrcvEeVMzgbHE0O3K75L6hUDLPNPqLLZOPG88tzRqv2CoBrJ95BV7w2vNh3qMaO4lSG1Ru3YlpL1biIsPNOvoKgPldoUY8my-HV6cxOhXc0fcLVdkJcuYJyEKzs3FZpKQkgPs2n4fpo2NaQ1sKcdYhO0E13VpcZAQcfEQ"
          />
        </div>
      </header>

      <main className="pt-[80px]">
        {/* 07 — Our Story */}
        <section className="max-w-7xl mx-auto px-8 py-24 relative grid grid-cols-12 gap-8">
          <div className="col-span-1 border-r border-[#c4c6d3] hidden lg:block">
            <span className="sticky top-48 text-xs font-['Inter'] uppercase tracking-widest text-[#747782] [writing-mode:vertical-lr] rotate-180 py-4 block">
              07 — Our Story
            </span>
          </div>
          <div className="col-span-12 lg:col-span-11 grid md:grid-cols-2 gap-16 items-start">
            <div className="border-l-4 border-[#002155] pl-8">
              <h1 className="text-5xl font-headline font-bold text-[#002155] mb-8 leading-tight tracking-tight">
                The Genesis of Excellence in Technical Education
              </h1>
              <div className="space-y-6 text-lg leading-relaxed text-[#434651] font-body">
                <p>
                  Established with a vision to bridge the gap between academic theory and industrial application, the TCET Center of Excellence (CoE) stands as a testament to institutional persistence. Our journey began not with a grand building, but with a simple directive: to provide a sanctuary for high-level technical research within Mumbai&apos;s thriving engineering landscape.
                </p>
                <p>
                  For over a decade, we have meticulously curated an environment that demands rigor. Our laboratories are not merely rooms filled with equipment; they are the crucibles where the next generation of intellectual property is forged. We maintain a neutral, evidence-based approach to every grant we secure and every paper we publish.
                </p>
              </div>
            </div>
            <div className="relative bg-[#e3e2df] p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="w-full grayscale brightness-90"
                alt="Architectural photograph of a modern university building facade with sharp shadows"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAb2yOMU6uP7lgQwxehZUDNw55-9DFNHgg1vTGJEEO5LfpM4oGK2lIajz3slddJcquvqmHPyHnHlHnqahMJWm5NaxeSX4n77dNZN6-45cD4Emg6lO6AZLiGTYYGtrhH7O7KV7PSPyOVwIS-zWGgfQwV6Mu2XMvel7Tc6hGlUev1sTGkeSt5gbMTWMmxkxoxi1yyHC-TUzi8HLYqpHV3OjS5mfBRGuxjYtA_CsOL5OSSt5yBago4al0p3jR4fAWyodKdcH4aphRkQg0"
              />
              <div className="mt-4 border-l-2 border-[#8c4f00] pl-4 py-2 bg-[#f5f4f0]">
                <p className="text-sm italic font-headline text-[#434651]">
                  &quot;The pursuit of knowledge is a structural endeavor, requiring both the foundation of tradition and the scaffolding of innovation.&quot; — Founding Dean
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 08 — The Team */}
        <section className="bg-[#f5f4f0] py-24">
          <div className="max-w-7xl mx-auto px-8 grid grid-cols-12 gap-8">
            <div className="col-span-1 border-r border-[#c4c6d3] hidden lg:block">
              <span className="sticky top-48 text-xs font-['Inter'] uppercase tracking-widest text-[#747782] [writing-mode:vertical-lr] rotate-180 py-4 block">
                08 — The Team
              </span>
            </div>
            <div className="col-span-12 lg:col-span-11">
              <div className="border-l-4 border-[#002155] pl-8 mb-16">
                <h2 className="text-4xl font-headline font-bold text-[#002155] tracking-tight">Faculty &amp; Administration</h2>
                <p className="text-[#747782] uppercase text-xs font-['Inter'] tracking-widest mt-2">Executive Directory</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border-t border-l border-[#c4c6d3]">
                {[
                  {
                    role: "Director of Research",
                    name: "Dr. B. K. Mishra",
                    phone: "+91 22 6730 8000",
                    email: "principal@tcetmumbai.in",
                  },
                  {
                    role: "Associate Professor & Dean",
                    name: "Dr. Kamal Shah",
                    phone: "+91 22 6730 8104",
                    email: "dean.rnd@tcetmumbai.in",
                  },
                  {
                    role: "Laboratory Head",
                    name: "Dr. Zahir Aalam",
                    phone: "+91 22 6730 8105",
                    email: "zahir.aalam@tcetmumbai.in",
                  },
                  {
                    role: "Grants Coordinator",
                    name: "Prof. Sheetal Rathi",
                    phone: "+91 22 6730 8108",
                    email: "sheetal.rathi@tcetmumbai.in",
                  },
                ].map((member) => (
                  <div key={member.name} className="p-8 border-r border-b border-[#c4c6d3] bg-white hover:bg-[#faf9f5] transition-colors">
                    <span className="block text-[10px] font-['Inter'] font-bold text-[#003580] uppercase tracking-widest mb-1">
                      {member.role}
                    </span>
                    <h3 className="text-2xl font-headline font-bold text-[#002155] mb-4">{member.name}</h3>
                    <div className="space-y-1 text-sm text-[#747782] font-body">
                      <p className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-base">call</span>
                        {member.phone}
                      </p>
                      <p className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-base">mail</span>
                        {member.email}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 09 — Journey */}
        <section className="py-24 max-w-7xl mx-auto px-8">
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-1 border-r border-[#c4c6d3] hidden lg:block">
              <span className="sticky top-48 text-xs font-['Inter'] uppercase tracking-widest text-[#747782] [writing-mode:vertical-lr] rotate-180 py-4 block">
                09 — Journey
              </span>
            </div>
            <div className="col-span-12 lg:col-span-11">
              <div className="border-l-4 border-[#002155] pl-8 mb-16">
                <h2 className="text-4xl font-headline font-bold text-[#002155] tracking-tight">Chronicles of Development</h2>
              </div>
              <div className="w-full overflow-hidden border border-[#c4c6d3]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#002155] text-white">
                      <th className="p-6 font-['Inter'] text-xs uppercase tracking-[0.1rem] border-r border-white/10">Year</th>
                      <th className="p-6 font-['Inter'] text-xs uppercase tracking-[0.1rem]">Institutional Milestone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        year: "2012",
                        title: "Foundation and Chartering",
                        desc: "Official ratification of the Center of Excellence by the Governing Body. Initiation of the first specialized research wing focusing on VLSI and Embedded Systems.",
                        alt: false,
                      },
                      {
                        year: "2015",
                        title: "Research Grant Acquisition",
                        desc: "Awarded the MODROB grant for laboratory modernization. Established the state-of-the-art Center for AI and Machine Learning research.",
                        alt: true,
                      },
                      {
                        year: "2018",
                        title: "Global Institutional Partnership",
                        desc: "Signed Memorandums of Understanding (MoU) with leading international technical universities for faculty exchange and collaborative patent filing.",
                        alt: false,
                      },
                      {
                        year: "2023",
                        title: "Patenting and IP Leadership",
                        desc: "Achieved a milestone of 50+ published patents and 200+ indexed research citations in Q1 journals under the CoE banner.",
                        alt: true,
                      },
                    ].map((item) => (
                      <tr key={item.year} className={`border-b border-[#c4c6d3] hover:bg-[#efeeea] transition-colors ${item.alt ? "bg-[#f5f4f0]" : ""}`}>
                        <td className="p-8 border-r border-[#c4c6d3] w-48">
                          <span className="text-5xl font-['Inter'] font-black text-[#002155] leading-none">{item.year}</span>
                        </td>
                        <td className="p-8">
                          <h4 className="text-2xl font-headline font-bold text-[#003580] mb-2">{item.title}</h4>
                          <p className="text-[#434651] max-w-2xl leading-relaxed">{item.desc}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#f5f4f0] text-[#002155] border-t-4 border-[#002155] w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 w-full px-12 py-16 max-w-full">
          <div className="space-y-6">
            <div className="text-lg font-bold text-[#002155]">TCET Center of Excellence</div>
            <p className="font-body leading-relaxed opacity-80 text-sm">
              A premier institutional research hub dedicated to the pursuit of technical rigor, innovation, and industry-aligned academic excellence in Mumbai.
            </p>
            <p className="text-[10px] font-['Inter'] uppercase tracking-widest text-[#747782]">Affiliated with Mumbai University</p>
          </div>
          <div className="space-y-6">
            <h5 className="text-xs font-['Inter'] uppercase tracking-[0.2rem] font-bold">Registry &amp; Compliance</h5>
            <ul className="space-y-3 text-sm font-body">
              <li><a className="text-slate-600 hover:text-[#002155] underline transition-colors" href="#">Institute Address &amp; NAAC</a></li>
              <li><a className="text-slate-600 hover:text-[#002155] underline transition-colors" href="#">Mumbai University</a></li>
              <li><a className="text-slate-600 hover:text-[#002155] underline transition-colors" href="#">Privacy Policy</a></li>
              <li><a className="text-slate-600 hover:text-[#002155] underline transition-colors" href="#">Contact Us</a></li>
            </ul>
          </div>
          <div className="space-y-6">
            <h5 className="text-xs font-['Inter'] uppercase tracking-[0.2rem] font-bold">Location</h5>
            <p className="font-body leading-relaxed opacity-80 text-sm">
              Thakur College of Engineering and Technology,<br />
              A-Block, Thakur Educational Campus,<br />
              Shyamnarayan Thakur Marg, Thakur Village,<br />
              Kandivali East, Mumbai - 400101
            </p>
            <div className="pt-4 border-t border-[#c4c6d3]">
              <p className="text-[10px] font-['Inter']">© 2024 TCET Center of Excellence. All Rights Reserved.</p>
            </div>
          </div>
        </div>
        <div className="bg-[#002155] py-4 px-12 text-center">
          <button
            className="text-white text-[10px] font-['Inter'] uppercase tracking-[0.2rem] hover:opacity-80 transition-opacity"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            Back to top
          </button>
        </div>
      </footer>
    </>
  );
}