"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  const links = [
    { label: "Home", href: "/" },
    { label: "About", href: "/about" },
    { label: "Research", href: "#" },
    { label: "Laboratory", href: "/laboratory" },
    { label: "Faculty Portal", href: "/faculty" },
    { label: "Events", href: "#" },
    { label: "Grants", href: "#" },
    { label: "News", href: "#" },
    { label: "Login", href: "/login" },
  ];

  return (
    <>
      {/* TopNoticeTicker */}
      <div className="bg-[#fd9923] flex items-center px-4 md:px-6 py-2 w-full z-[60] fixed top-0 border-none font-['Inter'] text-xs font-bold uppercase tracking-wider text-white marquee-scroll cursor-pointer">
        <span className="whitespace-nowrap flex items-center gap-2">
        </span>
        <div className="marquee-content ml-2 sm:ml-4">
          <span>Latest announcements and updates for TCET Center of Excellence — Call for Research Proposals 2024 is now open.</span>
          <span>Upcoming Workshop: Advanced Computing Architectures on Oct 25th.</span>
          <span>New High-Performance Computing Lab inaugurated by Hon. Director.</span>
        </div>
      </div>

      {/* TopNavBar */}
      <nav className="bg-[#002155] flex justify-between items-center w-full px-4 md:px-8 py-4 z-50 fixed top-[32px] sm:top-[32px] border-none shadow-md">
        <div className="flex items-center gap-3 md:gap-4 z-50">
          <div className="w-8 h-8 md:w-10 md:h-10 bg-white flex items-center justify-center shrink-0">
            <span className="text-[#002155] font-black text-lg md:text-xl">TC</span>
          </div>
          <Link href="/" className="text-lg md:text-xl font-bold text-white tracking-tighter uppercase flex flex-col leading-tight cursor-pointer">
            <span className="font-headline italic">TCET CoE</span>
            <span className="text-[9px] md:text-[10px] tracking-widest font-label opacity-80 hidden sm:block">Center of Excellence</span>
          </Link>
        </div>

        {/* Desktop Links */}
        <div className="hidden lg:flex items-center gap-6">
          {links.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={`${
                pathname === link.href
                  ? "text-[#fd9923] font-bold border-b-2 border-[#fd9923] pb-1"
                  : "text-white opacity-80 hover:opacity-100 hover:text-[#fd9923]"
              } transition-all text-xs font-['Inter'] uppercase tracking-[0.05rem]`}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/facility-booking"
            className={`${
              pathname === "/facility-booking"
                ? "bg-[#6b3b00]"
                : "bg-[#8c4f00] hover:bg-[#6b3b00]"
            } px-4 py-2 text-white text-[10px] sm:text-xs font-['Inter'] uppercase tracking-[0.05rem] transition-colors`}
          >
            Book Facility
          </Link>
        </div>

        {/* Mobile / Icons */}
        <div className="flex items-center gap-2 sm:gap-4 z-50">
          <div className="relative hidden md:block">
            
          </div>
          
          <button
            className="lg:hidden text-white p-2 hover:bg-[#003580] rounded transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            <span className="material-symbols-outlined text-2xl">
              {isMobileMenuOpen ? "close" : "menu"}
            </span>
          </button>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      <div 
        className={`fixed inset-0 bg-[#002155] z-40 lg:hidden flex flex-col pt-24 px-6 transition-transform duration-300 ease-in-out ${
          isMobileMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="relative mb-8 w-full block md:hidden">
         
        </div>

        <div className="flex flex-col gap-6 w-full h-full overflow-y-auto pb-8 custom-scrollbar">
          {links.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`${
                pathname === link.href
                  ? "text-[#fd9923] font-bold border-l-4 border-[#fd9923] pl-3"
                  : "text-white opacity-80 hover:opacity-100 pl-4"
              } transition-all text-sm font-['Inter'] uppercase tracking-widest block`}
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-4 pt-4 border-t border-white/20">
            <Link
              href="/facility-booking"
              onClick={() => setIsMobileMenuOpen(false)}
              className="inline-block w-full text-center bg-[#fd9923] hover:bg-[#8c4f00] py-4 text-[#002155] hover:text-white font-bold text-sm font-['Inter'] uppercase tracking-widest transition-colors"
            >
              Book Facility Form
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
