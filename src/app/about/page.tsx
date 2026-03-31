"use client";

import Link from "next/link";

export default function AboutPage() {
  return (
    <>

      <main className="pt-[100px] md:pt-[120px]">
        {/* 07 — Our Story */}
        <section className="max-w-7xl mx-auto px-4 md:px-8 py-12 md:py-24 relative grid grid-cols-12 gap-4 md:p-8">
          <div className="col-span-1 border-r border-[#c4c6d3] hidden lg:block">
            <span className="sticky top-48 text-xs font-['Inter'] uppercase tracking-widest text-[#747782] [writing-mode:vertical-lr] rotate-180 py-4 block">
              07 — Our Story
            </span>
          </div>
          <div className="col-span-12 lg:col-span-11 grid md:grid-cols-2 gap-8 md:gap-16 items-start">
            <div className="border-l-4 border-[#002155] pl-4 md:pl-8">
              <h1 className="text-4xl md:text-5xl font-headline font-bold text-[#002155] mb-4 md:mb-8 leading-tight tracking-tight">
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
                src="https://www.collegebatch.com/static/clg-gallery/thakur-college-of-engineering-technology-mumbai-229678.webp"
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
        <section className="bg-[#f5f4f0] py-12 md:py-24">
          <div className="max-w-7xl mx-auto px-4 md:px-8 grid grid-cols-12 gap-4 md:p-8">
            <div className="col-span-1 border-r border-[#c4c6d3] hidden lg:block">
              <span className="sticky top-48 text-xs font-['Inter'] uppercase tracking-widest text-[#747782] [writing-mode:vertical-lr] rotate-180 py-4 block">
                08 — The Team
              </span>
            </div>
            <div className="col-span-12 lg:col-span-11">
              <div className="border-l-4 border-[#002155] pl-4 md:pl-8 mb-4 md:mb-8 md:mb-16">
                <h2 className="text-4xl font-headline font-bold text-[#002155] tracking-tight">Faculty &amp; Administration</h2>
                <p className="text-[#747782] uppercase text-xs font-['Inter'] tracking-widest mt-2">Executive Directory</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border-t border-l border-[#c4c6d3]">
                {[
                  {
                    role: "Principal",
                    name: "Dr. B. K. Mishra",
                    email: "principal@tcetmumbai.in",
                  },
                  {
                    role: "Vice Principal",
                    name: "Dr. R. R.Sedamkar",
                    email: "tcet.vice-principal@thakureducation.org",
                  },
                  {
                    role: "Research & Development Dean",
                    name: "Dr. Vinit Kumar Dongre",
                    email: "vinit.dongre@tcetmumbai.in",
                  },
                  {
                    role: "Head of Research Culture",
                    name: "Dr. Loukik Salvi",
                    email: "loukik.salvi@tcetmumbai.in",
                  },
                ].map((member) => (
                  <div key={member.name} className="p-4 md:p-8 border-r border-b border-[#c4c6d3] bg-white hover:bg-[#faf9f5] transition-colors">
                    <span className="block text-[10px] font-['Inter'] font-bold text-[#003580] uppercase tracking-widest mb-1">
                      {member.role}
                    </span>
                    <h3 className="text-2xl font-headline font-bold text-[#002155] mb-4">{member.name}</h3>
                    <div className="space-y-1 text-sm text-[#747782] font-body">
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
        <section className="py-12 md:py-24 max-w-7xl mx-auto px-4 md:px-8">
          <div className="grid grid-cols-12 gap-4 md:p-8">
            <div className="col-span-1 border-r border-[#c4c6d3] hidden lg:block">
              <span className="sticky top-48 text-xs font-['Inter'] uppercase tracking-widest text-[#747782] [writing-mode:vertical-lr] rotate-180 py-4 block">
                09 — Journey
              </span>
            </div>
            <div className="col-span-12 lg:col-span-11">
              <div className="border-l-4 border-[#002155] pl-4 md:pl-8 mb-4 md:mb-8 md:mb-16">
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
                        <td className="p-4 md:p-8 border-r border-[#c4c6d3] w-48">
                          <span className="text-4xl md:text-5xl font-['Inter'] font-black text-[#002155] leading-none">{item.year}</span>
                        </td>
                        <td className="p-4 md:p-8">
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

    </>
  );
}