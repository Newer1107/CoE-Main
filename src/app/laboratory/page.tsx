"use client";

import { useState } from "react";

type Category = "Computing" | "Electronics" | "Fabrication";
type FilterOption = "All Equipment" | Category;

type Equipment = {
  id: number;
  name: string;
  category: Category;
  specs: { key: string; value: string }[];
  imageAlt: string;
  imageUrl: string;
};

export default function LaboratoryPage() {
  const [activeFilter, setActiveFilter] = useState<FilterOption>("All Equipment");

  const filters: FilterOption[] = [
    "All Equipment",
    "Computing",
    "Electronics",
    "Fabrication",
  ];

  const equipment: Equipment[] = [
    {
      id: 1,
      name: "Dell Pro Tower QCT 1250",
      category: "Computing",
      imageAlt:
        "Dell Pro Tower QCT 1250 desktop under lab lighting, connected to keyboard, mouse and 24 inch monitor",
      imageUrl:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuBhoT1SdZZYyvVB7pZ01EbLd_ybTFnomxautcchnI1YaNhLR3ATcfvIk9rV_S0DzDLTYVJBfS3q_AtaAQPzCdMRt2iMks5Pf9nld3T9Tna1dEs5FIs4LAmEbSWN31CXyxxrUWvLPbOpjmdr6TDlSAZ5mKLdocKNhqmUPm1bGP74NgLeT4KtcwxTEv3ca8TB9dwOGrGyx0vxHtR4n7DIZCp1yxPtq4ssjOdaSI2uQrJIUQRk36efMx5tLkd-E-JDOOKl1iRW5wZuw-M",
      specs: [
        { key: "RAM", value: "32 GB" },
        { key: "Storage", value: "1 TB SSD" },
        { key: "Monitor", value: "24''" },
        { key: "Qty", value: "30 units" },
        
      ],
    },
    {
      id: 2,
      name: "Dell Vostro 3910",
      category: "Computing",
      imageAlt:
        "Dell Vostro 3910 desktop in a lab environment with 19.5 inch monitor, keyboard, and mouse",
      imageUrl:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuAtZsCIDkxEcZaGGO4P6OhC7AEkY-d9qnaeizUsxOcMWqMcxN-xyWoxn9wl3vhFlw7a0mkLdZQGL6-7Ayk6yyQ0EdcA-Bd-osNCUkMVat6K68bnu2LP_uxvOXw4VOq5dZrnovEslGpF4MTyAuiK9JuLrzk3Le_ea7AZlcT5Fo7_1X6CRHh2C5_FVPtT4s9Tpi2l57VSlmAYRlgexhBbDJt1vD5g7YwZHYH8DNxhrLt0cJGWqjKY3XhDm3FiDEvGuRaz1jrg0-DhKyg",
      specs: [
        { key: "RAM", value: "16 GB" },
        { key: "Storage", value: "512 GB SSD" },
        { key: "Monitor", value: "19.5''" },
        { key: "Qty", value: "06 units" },
        
      ],
    },
    {
      id: 3,
      name: "EPSON LQ-310 Printer",
      category: "Electronics",
      imageAlt: "EPSON LQ-310 dot matrix printer in a lab computer bay",
      imageUrl:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuB44-P8e82oNHPGyeEsbnTLJwJtu0QaE4W3EISMUQ1TgKDD3_uy5fvTcbL0IoVHwHUbriSb3j_M19Az1MNjSQetFn0One6JXleY_uNffATgM4w-sQC9MqCLXaFJD5l-UOwlfbdRixYQJmkHr75iKNSKXNuawvFoNikDWIgfsFJWPyLfc0spohHeQ6m9Fc7obCAch7V7upesoFZydIVrp-vv9tFLGALZLDwBPQEo5kvpuZRHsu3Ai0Em8-y3pQo3P2-5GdWftkGL0DU",
      specs: [
        { key: "Type", value: "Dot matrix line printer" },
        { key: "Qty", value: "02 units" },
        
      ],
    },
  ];

  const filteredEquipment =
    activeFilter === "All Equipment"
      ? equipment
      : equipment.filter((item) => item.category === activeFilter);

  return (
    <main className="pt-[100px] md:pt-[120px] pb-20 max-w-7xl mx-auto px-4 md:px-8">
      <section className="mb-4 md:mb-8 md:mb-16 border-l-4 border-[#002155] pl-4 md:pl-8 py-4 mt-8">
        <h2 className="text-3xl md:text-[40px] font-headline tracking-tight leading-none mb-4">
          Laboratory Infrastructure & Research Facilities
        </h2>
        <p className="max-w-3xl text-lg text-[#434651] font-body leading-relaxed">
          The TCET Center of Excellence houses state-of-the-art computational and
          experimental environments designed for high-impact multidisciplinary
          research. Our facilities serve as the bedrock for innovation in
          Electronics, Fabrication, and Advanced Computing.
        </p>
      </section>

      <section className="mb-4 md:mb-8 md:mb-12">
        <div className="flex flex-wrap gap-1 border-b border-[#c4c6d3] pb-px">
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              aria-pressed={activeFilter === filter}
              className={`px-4 md:px-8 py-3 font-['Inter'] text-xs font-bold uppercase tracking-wider transition-all ${
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

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border-t border-l border-[#c4c6d3] mb-20">
        {filteredEquipment.map((item) => (
          <div
            key={item.id}
            className="border-r border-b border-[#c4c6d3] p-6 bg-white hover:shadow-lg transition-shadow"
          >
            <div className="aspect-video mb-6 overflow-hidden rounded-lg">
              <img
                className="w-full h-full object-cover grayscale-img hover:grayscale-0 transition-all duration-300"
                alt={item.imageAlt}
                src={item.imageUrl}
              />
            </div>

            <h3 className="font-headline font-bold text-2xl mb-2 italic line-clamp-2">{item.name}</h3>
            
            <p className="text-sm font-['Inter'] text-[#8c4f00] font-bold uppercase tracking-tighter mb-2">
              {item.category}
            </p>
            
            <div className="space-y-1 text-xs text-[#434651] border-t border-[#c4c6d3] pt-4 max-h-48 overflow-y-auto">
              {item.specs.map((spec) => (
                <div key={spec.key} className="flex justify-between py-px">
                  <span className="text-[#747782] truncate">{spec.key}:</span>
                  <span className="font-semibold text-[#1b1c1a] text-right min-w-[60%]">
                    {spec.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="mb-4 md:mb-8">
        <div className="flex items-center gap-4 mb-4 md:mb-8">
          <div className="h-[1px] flex-grow bg-[#c4c6d3]"></div>
          <h2 className="text-sm font-['Inter'] font-black uppercase tracking-[0.2em] text-[#002155]">
            Specialized Research Facilities
          </h2>
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
            <div
              key={facility}
              className="flex justify-between py-3 border-b border-[#c4c6d3] hover:bg-[#f8f9fa] px-2 rounded transition-colors cursor-pointer group"
            >
              <span className="font-headline italic text-lg text-[#002155] group-hover:text-[#002155]/80">
                {facility}
              </span>
              <span className="material-symbols-outlined text-[#747782] group-hover:translate-x-1 transition-transform">
                chevron_right
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}