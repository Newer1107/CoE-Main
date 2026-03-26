"use client";

import Link from "next/link";

export default function HomePage() {
  return (
    <>
      {/* TopNoticeTicker */}
      <div className="bg-[#fd9923] flex items-center px-6 py-2 w-full z-[60] fixed top-0 border-none font-['Inter'] text-xs font-bold uppercase tracking-wider text-white marquee-scroll cursor-pointer">
        <span className="whitespace-nowrap flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">notifications</span>
          🔔 Notice:
        </span>
        <div className="marquee-content">
          <span>Latest announcements and updates for TCET Center of Excellence — Call for Research Proposals 2024 is now open.</span>
          <span>Upcoming Workshop: Advanced Computing Architectures on Oct 25th.</span>
          <span>New High-Performance Computing Lab inaugurated by Hon. Director.</span>
        </div>
      </div>

      {/* TopNavBar */}
      <nav className="bg-[#002155] flex justify-between items-center w-full px-8 py-4 z-50 fixed top-[32px] border-none">
        <div className="flex items-center gap-4">
          <div className="text-xl font-bold text-white tracking-tighter uppercase flex flex-col leading-tight">
            <span className="font-headline italic text-2xl">TCET</span>
            <span className="text-xs tracking-widest font-label opacity-80">Center of Excellence</span>
          </div>
        </div>
        <div className="hidden lg:flex items-center gap-8">
          <Link className="text-[#fd9923] font-bold border-b-2 border-[#fd9923] pb-1 text-xs font-['Inter'] uppercase tracking-[0.05rem]" href="/">Home</Link>
          <Link className="text-white opacity-80 hover:opacity-100 hover:text-[#fd9923] transition-all text-xs font-['Inter'] uppercase tracking-[0.05rem]" href="/about">About</Link>
          <Link className="text-white opacity-80 hover:opacity-100 hover:text-[#fd9923] transition-all text-xs font-['Inter'] uppercase tracking-[0.05rem]" href="#">Research</Link>
          <Link className="text-white opacity-80 hover:opacity-100 hover:text-[#fd9923] transition-all text-xs font-['Inter'] uppercase tracking-[0.05rem]" href="/laboratory">Laboratory</Link>
          <Link className="text-white opacity-80 hover:opacity-100 hover:text-[#fd9923] transition-all text-xs font-['Inter'] uppercase tracking-[0.05rem]" href="#">Events</Link>
          <Link className="text-white opacity-80 hover:opacity-100 hover:text-[#fd9923] transition-all text-xs font-['Inter'] uppercase tracking-[0.05rem]" href="#">Grants</Link>
          <Link className="text-white opacity-80 hover:opacity-100 hover:text-[#fd9923] transition-all text-xs font-['Inter'] uppercase tracking-[0.05rem]" href="#">News</Link>
          <Link className="text-white opacity-80 hover:opacity-100 hover:text-[#fd9923] transition-all text-xs font-['Inter'] uppercase tracking-[0.05rem]" href="/facility-booking">Book Facility</Link>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <input
              className="bg-[#003580] text-white text-xs border-none px-4 py-2 w-48 placeholder:text-blue-300 focus:ring-1 focus:ring-[#fd9923] outline-none"
              placeholder="Search Archives..."
              type="text"
            />
            <span className="material-symbols-outlined absolute right-2 top-1.5 text-white text-lg">search</span>
          </div>
        </div>
      </nav>

      {/* Main Content Layout */}
      <main className="max-w-[1440px] mx-auto grid grid-cols-12 gap-0 min-h-screen pt-[80px]">
        {/* Left Margin / Vertical Nav Indication */}
        <div className="hidden md:flex col-span-1 border-r border-[#c4c6d3] items-start justify-center pt-24 bg-[#f5f4f0]">
          <div className="rotate-180 [writing-mode:vertical-lr] flex items-center gap-6 text-[#002155] opacity-40 font-['Inter'] text-[10px] tracking-[0.3em] uppercase">
            <span>ESTABLISHED 2001</span>
            <span className="w-12 h-[1px] bg-[#002155]"></span>
            <span>TCET COE DOMAIN</span>
          </div>
        </div>

        {/* Central Column */}
        <div className="col-span-12 md:col-span-8 p-8 lg:p-12">
          {/* Banner Section */}
          <section className="mb-12">
            <div className="bg-[#e3e2df] aspect-[21/9] w-full overflow-hidden relative border border-[#c4c6d3]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="w-full h-full object-cover grayscale-[30%] hover:grayscale-0 transition-all duration-700"
                alt="Modern high-tech university engineering laboratory with students working on advanced robotic arms and circuitry"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDJnWnqCv8p7bInxWAXwpxuomZMAxs08GDwZdj8jhmPagckgZ7rC_fSo4FnqW_n5HQN1eRHF51_yHL9oRYZp0OGzqxSjn7T5ICVOFdrRkpLtb41YJJ3Q9XYmbhRZz_vJpLm3X1kt-Do-Wur4ciDK1WN55Ybhgz_wI2G6ioqfbQKt4I0z7wHJ9K1iHbkBEvZEuZL8YjqS9Z_k9nPDyMVgJgNJ5DlTjdIg2EF4FJAQf5rgVBuugmgeeUdKQ0RSG2vXzyzZ2BlOVMA3xo"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-[#002155]/90 text-white p-3 text-xs font-['Inter'] tracking-wide">
                CENTRAL RESEARCH FACILITY: ADVANCED COMPUTING &amp; ROBOTICS DIVISION - LABORATORY 04
              </div>
            </div>
          </section>

          {/* Stats Counter Row */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16 border-y border-[#c4c6d3] py-8">
            <div className="text-center md:text-left">
              <div className="text-[#002155] font-headline text-3xl font-bold">12</div>
              <div className="text-xs font-['Inter'] uppercase tracking-widest text-[#747782]">Research Projects</div>
            </div>
            <div className="text-center md:text-left">
              <div className="text-[#002155] font-headline text-3xl font-bold">4</div>
              <div className="text-xs font-['Inter'] uppercase tracking-widest text-[#747782]">Labs</div>
            </div>
            <div className="text-center md:text-left">
              <div className="text-[#002155] font-headline text-3xl font-bold">38</div>
              <div className="text-xs font-['Inter'] uppercase tracking-widest text-[#747782]">Publications</div>
            </div>
            <div className="text-center md:text-left">
              <div className="text-[#002155] font-headline text-3xl font-bold">₹2.4Cr</div>
              <div className="text-xs font-['Inter'] uppercase tracking-widest text-[#747782]">Grants Secured</div>
            </div>
          </section>

          {/* About Section */}
          <section className="mb-16">
            <div className="border-l-4 border-[#002155] pl-6 mb-8">
              <h2 className="font-headline text-3xl text-[#002155] tracking-tight">Institutional Mandate</h2>
              <p className="text-xs font-['Inter'] uppercase tracking-widest text-[#8c4f00] mt-1">Foundational Pillars of Excellence</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div className="space-y-4">
                <p className="font-body text-[#1b1c1a] leading-relaxed">
                  The TCET Center of Excellence (CoE) serves as the vanguard of technological advancement at Thakur College of Engineering &amp; Technology. Our mission is to bridge the gap between academic theory and industrial application through rigorous research and development.
                </p>
                <p className="font-body text-[#1b1c1a] leading-relaxed opacity-80 italic">
                  &quot;Innovation is not an event, but a continuous pursuit of scholarly rigor and practical utility.&quot;
                </p>
                <Link href="/about" className="inline-block bg-[#002155] text-white px-6 py-3 font-['Inter'] text-xs uppercase tracking-widest hover:bg-[#003580] transition-colors">
                  Institutional Profile
                </Link>
              </div>
              <div className="bg-[#efeeea] p-6 border-t border-[#c4c6d3]">
                <h4 className="font-headline text-xl text-[#002155] mb-4">Core Focus Areas</h4>
                <ul className="space-y-3 text-sm font-body">
                  <li className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[#8c4f00] text-sm">check_circle</span>
                    High-Performance Cloud Computing
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[#8c4f00] text-sm">check_circle</span>
                    Artificial Intelligence &amp; Machine Learning
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[#8c4f00] text-sm">check_circle</span>
                    VLSI Design &amp; Embedded Systems
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[#8c4f00] text-sm">check_circle</span>
                    Sustainable Energy Solutions
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* Laboratory Preview */}
          <section className="mb-16">
            <div className="border-l-4 border-[#002155] pl-6 mb-8">
              <h2 className="font-headline text-3xl text-[#002155] tracking-tight">Specialized Facilities</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-1">
              <div className="relative aspect-square group overflow-hidden bg-[#002155]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="w-full h-full object-cover opacity-60 group-hover:scale-110 transition-transform duration-500"
                  alt="Macro shot of intricate gold-plated computer circuit boards and electronic micro-components"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuCM8sj0cGrKWXDKR4SaEvCC2TGmuSDZ-7AlYTh06Bsmbo5_Or2TcdP_HADkh4mlALdX6-AY41FwOdmzvWFUyxsT6K0lv9HQ80hTjjMsfTtg8iCcEyevtoovuyLi5WT2hOZtqPl5W0c7eZ5RSJeyI3-YifQK9O0qPKGBWn_cyRIW4kBIjNRIDJasTOUkAEv7vlt2Puyq3QbCNw8nfMV-ftN_o0vK_ZDtHUdEriTL4ti_Yyn5rqkOMFy3o9RxkR5DBae-I9kfs8iKDrI"
                />
                <div className="absolute inset-0 p-6 flex flex-col justify-end text-white">
                  <span className="text-[10px] font-['Inter'] tracking-widest uppercase opacity-70">Facility 01</span>
                  <h3 className="font-headline text-lg">Embedded IoT Lab</h3>
                </div>
              </div>
              <div className="relative aspect-square group overflow-hidden bg-[#002155]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="w-full h-full object-cover opacity-60 group-hover:scale-110 transition-transform duration-500"
                  alt="Server room with rows of blue LED-lit server racks and organized networking cables"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuB25dR0W2nSUOOnS6wtwndvoGuD10s4kJ-A1ColdkGM40J3DjYh9ltxVz6T_l3G8uamzT5XIUX181Y6YOYslXIZLlg_IEXnv0c1Q1_fPPOnhlGJd4mVrVxbxEEc1gg0_gqrXRj3pNdRgqPZgdXGjONcMv7wPIz3LL9PTTkzdOWfnN2XmJOtwSlgfv59YVAtIx1JTcmnhvdNoabhJpEPmZUB8F8-9i18C9VPr0_TBlzGrtrw9duekF5Wvb8Bcu0XjblHsfeUFBd_eso"
                />
                <div className="absolute inset-0 p-6 flex flex-col justify-end text-white">
                  <span className="text-[10px] font-['Inter'] tracking-widest uppercase opacity-70">Facility 02</span>
                  <h3 className="font-headline text-lg">Data Science Hub</h3>
                </div>
              </div>
              <div className="relative aspect-square group overflow-hidden bg-[#002155]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="w-full h-full object-cover opacity-60 group-hover:scale-110 transition-transform duration-500"
                  alt="Mechanical engineering student using a digital caliper to measure a 3D-printed industrial component"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuCsJdTk6IiPYG6hv1WXyMzpXzd4DBu_atVSCpybeossWaz9pYIsdWOo0JO4noPOJhBS7d83CEd5kudzcRxnXSzhIbICTTpJFbGYMvD8I3waIq3d_LJpM_9ZHYHJ2qr2smzVs2TpH0UphWf6oXMsPZheK_s2HmhdwI6VC71X_Nr7oXmb6kFKL7gH02JNK8AB61tKlj9yTuMw53g-SIH4lFJDJHww3b9t7jRA0qgLGWEnzFY0Re1G5eLpPuDOroQfC5GOQ5sTrHTPl2U"
                />
                <div className="absolute inset-0 p-6 flex flex-col justify-end text-white">
                  <span className="text-[10px] font-['Inter'] tracking-widest uppercase opacity-70">Facility 03</span>
                  <h3 className="font-headline text-lg">Precision Fab Lab</h3>
                </div>
              </div>
            </div>
          </section>

          {/* Grants Section */}
          <section className="space-y-16 mt-16 pb-12">
            <div>
              <div className="border-l-4 border-[#002155] pl-6 mb-8">
                <h2 className="text-3xl font-headline tracking-tight text-[#002155]">Current Grant Opportunities</h2>
                <p className="text-sm font-['Inter'] text-[#747782] uppercase tracking-widest mt-1">Research Funding &amp; Fellowships 2024</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[#002155] text-white font-['Inter'] text-[11px] uppercase tracking-widest text-left">
                      <th className="p-4 font-bold border-r border-white/10">Funding Agency</th>
                      <th className="p-4 font-bold border-r border-white/10">Scheme / Project</th>
                      <th className="p-4 font-bold border-r border-white/10">Deadline</th>
                      <th className="p-4 font-bold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="font-body text-sm">
                    <tr className="bg-[#f5f4f0] border-b border-[#c4c6d3]">
                      <td className="p-4 font-semibold text-[#002155]">SERB (DST)</td>
                      <td className="p-4">Core Research Grant (CRG) - Engineering Sciences</td>
                      <td className="p-4">Oct 15, 2024</td>
                      <td className="p-4"><a className="text-[#8c4f00] font-bold underline" href="#">Apply Now</a></td>
                    </tr>
                    <tr className="bg-white border-b border-[#c4c6d3]">
                      <td className="p-4 font-semibold text-[#002155]">AICTE</td>
                      <td className="p-4">Modernisation and Removal of Obsolescence (MODROBS)</td>
                      <td className="p-4">Nov 02, 2024</td>
                      <td className="p-4"><a className="text-[#8c4f00] font-bold underline" href="#">Apply Now</a></td>
                    </tr>
                    <tr className="bg-[#f5f4f0] border-b border-[#c4c6d3]">
                      <td className="p-4 font-semibold text-[#002155]">ISRO</td>
                      <td className="p-4">RESPOND Program - Space Research Applications</td>
                      <td className="p-4">Dec 12, 2024</td>
                      <td className="p-4"><a className="text-[#8c4f00] font-bold underline" href="#">Apply Now</a></td>
                    </tr>
                    <tr className="bg-white border-b border-[#c4c6d3]">
                      <td className="p-4 font-semibold text-[#002155]">MeitY</td>
                      <td className="p-4">R&amp;D in Microelectronics and Nanotechnology Hubs</td>
                      <td className="p-4">Oct 30, 2024</td>
                      <td className="p-4"><a className="text-[#8c4f00] font-bold underline" href="#">Apply Now</a></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="border-l-4 border-[#002155] pl-6 mb-8">
                <h2 className="text-3xl font-headline tracking-tight text-[#002155]">Funding Agencies Directory</h2>
                <p className="text-sm font-['Inter'] text-[#747782] uppercase tracking-widest mt-1">Institutional Liaisons &amp; Portals</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[#002155] text-white font-['Inter'] text-[11px] uppercase tracking-widest text-left">
                      <th className="p-4 font-bold border-r border-white/10">Agency Name</th>
                      <th className="p-4 font-bold border-r border-white/10">Primary Focus</th>
                      <th className="p-4 font-bold border-r border-white/10">Region</th>
                      <th className="p-4 font-bold">Portal</th>
                    </tr>
                  </thead>
                  <tbody className="font-body text-sm">
                    <tr className="bg-[#f5f4f0] border-b border-[#c4c6d3]">
                      <td className="p-4 font-semibold text-[#002155]">UGC</td>
                      <td className="p-4">University Infrastructure &amp; Education Quality</td>
                      <td className="p-4">National (India)</td>
                      <td className="p-4"><span className="material-symbols-outlined text-sm">open_in_new</span></td>
                    </tr>
                    <tr className="bg-white border-b border-[#c4c6d3]">
                      <td className="p-4 font-semibold text-[#002155]">CSIR</td>
                      <td className="p-4">Industrial &amp; Scientific Innovations</td>
                      <td className="p-4">National (India)</td>
                      <td className="p-4"><span className="material-symbols-outlined text-sm">open_in_new</span></td>
                    </tr>
                    <tr className="bg-[#f5f4f0] border-b border-[#c4c6d3]">
                      <td className="p-4 font-semibold text-[#002155]">DRDO</td>
                      <td className="p-4">Defense R&amp;D and Strategic Systems</td>
                      <td className="p-4">National (India)</td>
                      <td className="p-4"><span className="material-symbols-outlined text-sm">open_in_new</span></td>
                    </tr>
                    <tr className="bg-white border-b border-[#c4c6d3]">
                      <td className="p-4 font-semibold text-[#002155]">BRNS (DAE)</td>
                      <td className="p-4">Nuclear Science &amp; Allied Engineering Research</td>
                      <td className="p-4">National (India)</td>
                      <td className="p-4"><span className="material-symbols-outlined text-sm">open_in_new</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <aside className="col-span-12 md:col-span-3 border-l border-[#c4c6d3] bg-[#f5f4f0] min-h-full">
          <div className="sticky top-[80px]">
            {/* Circulars Box */}
            <div className="p-6">
              <div className="bg-[#002155] p-4 flex items-center gap-3">
                <span className="material-symbols-outlined text-white">campaign</span>
                <h3 className="text-white font-['Inter'] text-xs font-bold uppercase tracking-widest">Latest Circulars</h3>
              </div>
              <div className="bg-white border-x border-b border-[#c4c6d3] h-[500px] overflow-y-auto custom-scrollbar">
                <div className="p-5 border-b border-[#c4c6d3] hover:bg-[#faf9f5] transition-colors cursor-pointer group">
                  <span className="text-[10px] font-bold text-[#747782] uppercase tracking-tighter">Oct 12, 2024</span>
                  <h4 className="font-body font-semibold text-[#002155] text-sm mt-1 group-hover:text-[#8c4f00] leading-tight">Revised Lab Access Protocols for Final Year Research Scholars</h4>
                  <a className="inline-flex items-center text-[10px] font-bold text-[#8c4f00] uppercase mt-2 tracking-widest" href="#">Read More →</a>
                </div>
                <div className="p-5 border-b border-[#c4c6d3] hover:bg-[#faf9f5] transition-colors cursor-pointer group">
                  <span className="text-[10px] font-bold text-[#747782] uppercase tracking-tighter">Oct 10, 2024</span>
                  <h4 className="font-body font-semibold text-[#002155] text-sm mt-1 group-hover:text-[#8c4f00] leading-tight">Approval of External Seed Funding for AI-Healthcare Project</h4>
                  <a className="inline-flex items-center text-[10px] font-bold text-[#8c4f00] uppercase mt-2 tracking-widest" href="#">Read More →</a>
                </div>
                <div className="p-5 border-b border-[#c4c6d3] hover:bg-[#faf9f5] transition-colors cursor-pointer group">
                  <span className="text-[10px] font-bold text-[#747782] uppercase tracking-tighter">Oct 05, 2024</span>
                  <h4 className="font-body font-semibold text-[#002155] text-sm mt-1 group-hover:text-[#8c4f00] leading-tight">Notice regarding MU Affiliation Documentation for Labs</h4>
                  <a className="inline-flex items-center text-[10px] font-bold text-[#8c4f00] uppercase mt-2 tracking-widest" href="#">Read More →</a>
                </div>
                <div className="p-5 border-b border-[#c4c6d3] hover:bg-[#faf9f5] transition-colors cursor-pointer group">
                  <span className="text-[10px] font-bold text-[#747782] uppercase tracking-tighter">Sep 28, 2024</span>
                  <h4 className="font-body font-semibold text-[#002155] text-sm mt-1 group-hover:text-[#8c4f00] leading-tight">Guest Lecture: Ethics in Intellectual Property Rights (IPR)</h4>
                  <a className="inline-flex items-center text-[10px] font-bold text-[#8c4f00] uppercase mt-2 tracking-widest" href="#">Read More →</a>
                </div>
                <div className="p-5 border-b border-[#c4c6d3] hover:bg-[#faf9f5] transition-colors cursor-pointer group">
                  <span className="text-[10px] font-bold text-[#747782] uppercase tracking-tighter">Sep 25, 2024</span>
                  <h4 className="font-body font-semibold text-[#002155] text-sm mt-1 group-hover:text-[#8c4f00] leading-tight">Inventory Audit - All Specialized Laboratories Q3</h4>
                  <a className="inline-flex items-center text-[10px] font-bold text-[#8c4f00] uppercase mt-2 tracking-widest" href="#">Read More →</a>
                </div>
              </div>
            </div>

            {/* Fast Actions */}
            <div className="px-6 pb-6 space-y-3">
              <Link href="/facility-booking" className="border-l-2 border-[#8c4f00] pl-4 py-2 bg-white border border-[#c4c6d3] flex items-center justify-between group cursor-pointer">
                <div>
                  <span className="text-[9px] font-bold text-[#747782] uppercase tracking-widest">Booking Portal</span>
                  <h5 className="text-xs font-bold text-[#002155] uppercase">Lab Seat Reservation</h5>
                </div>
                <span className="material-symbols-outlined text-[#8c4f00] mr-2 group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </Link>
              <div className="border-l-2 border-[#8c4f00] pl-4 py-2 bg-white border border-[#c4c6d3] flex items-center justify-between group cursor-pointer">
                <div>
                  <span className="text-[9px] font-bold text-[#747782] uppercase tracking-widest">E-Submission</span>
                  <h5 className="text-xs font-bold text-[#002155] uppercase">Grant Application Portal</h5>
                </div>
                <span className="material-symbols-outlined text-[#8c4f00] mr-2 group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </div>
            </div>
          </div>
        </aside>
      </main>

      {/* Footer */}
      <footer className="bg-[#f5f4f0] text-[#002155] grid grid-cols-1 md:grid-cols-3 gap-12 w-full px-12 py-16 max-w-full border-t-4 border-[#002155]">
        <div>
          <h3 className="text-lg font-bold text-[#002155] mb-6 uppercase tracking-tight">TCET Center of Excellence</h3>
          <p className="font-body leading-relaxed opacity-70 text-sm">
            Thakur Village, Kandivali (E), Mumbai - 400101.<br />
            Maharashtra, India.<br /><br />
            Email: coe@tcetmumbai.in<br />
            Phone: +91 22 6730 8000
          </p>
        </div>
        <div>
          <h4 className="text-xs font-bold uppercase tracking-widest text-[#8c4f00] mb-6">Institutional Quick Links</h4>
          <ul className="space-y-3 text-sm font-body">
            <li><a className="text-slate-600 hover:text-[#002155] underline transition-all" href="#">Institute Address &amp; NAAC</a></li>
            <li><a className="text-slate-600 hover:text-[#002155] underline transition-all" href="#">Mumbai University</a></li>
            <li><a className="text-slate-600 hover:text-[#002155] underline transition-all" href="#">Quick Links</a></li>
            <li><a className="text-slate-600 hover:text-[#002155] underline transition-all" href="#">Privacy Policy</a></li>
            <li><a className="text-slate-600 hover:text-[#002155] underline transition-all" href="#">Contact Us</a></li>
          </ul>
        </div>
        <div className="flex flex-col justify-between">
          <div className="flex flex-col gap-4">
            <h4 className="text-xs font-bold uppercase tracking-widest text-[#8c4f00]">Accreditation</h4>
            <div className="flex gap-4">
              <div className="w-12 h-12 bg-white/50 border border-[#c4c6d3] flex items-center justify-center font-bold text-[10px] text-center p-1">NAAC A+</div>
              <div className="w-12 h-12 bg-white/50 border border-[#c4c6d3] flex items-center justify-center font-bold text-[10px] text-center p-1">NBA</div>
              <div className="w-12 h-12 bg-white/50 border border-[#c4c6d3] flex items-center justify-center font-bold text-[10px] text-center p-1">ISO</div>
            </div>
          </div>
          <p className="text-[10px] opacity-60 mt-8">
            © 2024 TCET Center of Excellence. All Rights Reserved. Designed for Academic Integrity.
          </p>
        </div>
      </footer>
    </>
  );
}