"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type NavbarProps = {
  user: {
    name: string;
    email: string;
    role: string;
    uid?: string;
  } | null;
};

export default function Navbar({ user }: NavbarProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentPathWithSearch = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  const loginHref = `/login?next=${encodeURIComponent(currentPathWithSearch)}`;
  const bookingLoginHref = `/login?next=${encodeURIComponent("/facility-booking")}&reason=booking-auth-required`;
  const userRole = user?.role || null;
  const canSeeFacultyPortal = userRole === "FACULTY" || userRole === "ADMIN";
  const canSeeAdminPanel = userRole === "ADMIN";
  const canSeeMySubmissions = userRole === "STUDENT";
  const isLoggedIn = !!user;
  const bookFacilityHref = isLoggedIn ? "/facility-booking" : bookingLoginHref;

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      window.location.href = "/login";
    }
  };

  const links = [
    { label: "Home", href: "/" },
    { label: "About", href: "/about" },
    { label: "Innovation", href: "/innovation" },
    { label: "Laboratory", href: "/laboratory" },
    ...(canSeeFacultyPortal ? [{ label: "Faculty Portal", href: "/faculty" }] : []),
    ...(canSeeAdminPanel ? [{ label: "Admin", href: "/admin" }] : []),
    { label: "Events", href: "/#events" },
    { label: "Grants", href: "/#grants" },
    { label: "News", href: "/#news" },
    ...(!isLoggedIn ? [{ label: "Login", href: loginHref }] : []),
  ];

  return (
    <>
      {/* TopNoticeTicker */}
      <div className="bg-[#705e49] flex items-center px-4 md:px-6 py-2 w-full z-[60] fixed top-0 border-none font-['Inter'] text-xs font-bold uppercase tracking-wider text-white marquee-scroll cursor-pointer">
        <span className="whitespace-nowrap flex items-center gap-2"></span>
        <div className="marquee-content ml-2 sm:ml-4">
          <span>
            Latest announcements and updates for TCET Center of Excellence —
            Call for Research Proposals 2024 is now open.
          </span>
          <span>
            Upcoming Workshop: Advanced Computing Architectures on Oct 25th.
          </span>
          <span>
            New High-Performance Computing Lab inaugurated by Hon. Director.
          </span>
        </div>
      </div>

      {/* TopNavBar */}
      <nav className="bg-[#002155] flex justify-between items-center w-full px-4 md:px-8 py-4 z-50 fixed top-[32px] sm:top-[32px] border-none shadow-md">
        {/* LEFT SIDE: CoE Logo and Brand Name */}
        <div className="flex items-center gap-4 md:gap-5 z-50">
          <Link
            href="/"
            className="shrink-0 flex items-center justify-center group"
          >
            <Image
              src="/coe-logo.jpeg"
              alt="CoE Logo"
              width={80}
              height={80}
              priority // <--- This tells Next.js to preload this image
              className="object-contain w-12 h-10 md:w-16 md:h-12 transition-transform group-hover:scale-105"
            />
          </Link>

          <Link
            href="/"
            className="text-lg md:text-xl font-bold text-white tracking-tighter uppercase flex flex-col leading-tight cursor-pointer"
          >
            <span className="font-multiple ">TCET CENTRE OF EXCELLENCE</span>
            <span className="text-[10px] md:text-[11px] tracking-[0.2em] font-label opacity-90 hidden sm:block">
              For Research Culture & Development
            </span>
          </Link>
        </div>

        {/* RIGHT SIDE: Desktop Links + TCET Logo + Mobile Toggle */}
        <div className="flex items-center gap-6 z-50">
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
              href={bookFacilityHref}
              className={`${
                pathname === "/facility-booking"
                  ? "bg-[#f98e14]"
                  : "bg-[#f98e14] hover:bg-[#6b3b00]"
              } px-4 py-2 text-white font-bold text-[10px] sm:text-xs font-['Inter'] uppercase tracking-[0.05rem] transition-colors`}
            >
              Book Facility
            </Link>
            {isLoggedIn ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsUserMenuOpen((prev) => !prev)}
                  className="flex items-center gap-2 border border-white/30 px-2 py-1 text-white hover:bg-white/10"
                >
                  <span className="material-symbols-outlined text-lg">account_circle</span>
                  <span className="max-w-[120px] truncate text-[10px] font-bold uppercase tracking-wider">
                    {user?.name || "Account"}
                  </span>
                </button>
                {isUserMenuOpen ? (
                  <div className="absolute right-0 top-[110%] w-[300px] border border-[#c4c6d3] bg-white p-3 shadow-lg">
                    <p className="text-[10px] uppercase tracking-widest text-[#747782]">Signed In</p>
                    <p className="mt-1 text-sm font-bold text-[#002155]">{user?.name}</p>
                    <p className="mt-1 text-xs text-[#434651]">{user?.email}</p>
                    <p className="mt-1 text-xs text-[#434651]">Role: {user?.role}</p>
                    {user?.uid ? <p className="mt-1 text-xs text-[#434651]">UID: {user.uid}</p> : null}

                    <div className="mt-3 grid grid-cols-1 gap-2">
                      {canSeeMySubmissions ? (
                        <Link
                          href="/innovation/my-submissions"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="border border-[#002155] px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-[#002155]"
                        >
                          My Submissions
                        </Link>
                      ) : null}
                      <Link
                        href="/facility-booking"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="border border-[#8c4f00] px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-[#8c4f00]"
                      >
                        My Booking Area
                      </Link>
                      <button
                        type="button"
                        onClick={() => void handleLogout()}
                        className="bg-[#002155] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white"
                      >
                        Logout
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* EXTREME RIGHT: TCET Logo */}
          <div className="shrink-0 flex items-center justify-center ml-2 sm:ml-4">
            <Image
              src="/tcetlogo.png"
              alt="TCET Logo"
              width={64}
              height={48}
              priority // <--- This also preloads the TCET logo
              className="object-contain w-12 h-10 md:w-16 md:h-12"
            />
          </div>

          {/* Mobile Toggle Button */}
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
        <div className="relative mb-8 w-full block md:hidden"></div>

        <div className="flex flex-col gap-6 w-full h-full overflow-y-auto pb-8 custom-scrollbar">
          {isLoggedIn ? (
            <div className="border border-white/25 bg-white/10 p-4 text-white">
              <p className="text-[10px] uppercase tracking-widest text-white/70">Signed In</p>
              <p className="mt-1 text-sm font-bold">{user?.name}</p>
              <p className="mt-1 text-xs text-white/80">{user?.email}</p>
              <p className="mt-1 text-xs text-white/80">Role: {user?.role}</p>
              {user?.uid ? <p className="mt-1 text-xs text-white/80">UID: {user.uid}</p> : null}
            </div>
          ) : null}
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
              href={bookFacilityHref}
              onClick={() => setIsMobileMenuOpen(false)}
              className="inline-block w-full text-center bg-[#fd9923] hover:bg-[#8c4f00] py-4 text-[#002155] hover:text-white font-bold text-sm font-['Inter'] uppercase tracking-widest transition-colors"
            >
              Book Facility Form
            </Link>
            {isLoggedIn ? (
              <>
                {canSeeMySubmissions ? (
                  <Link
                    href="/innovation/my-submissions"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="mt-3 inline-block w-full border border-white/40 py-3 text-center text-xs font-bold uppercase tracking-wider text-white"
                  >
                    My Submissions
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="mt-3 inline-block w-full bg-[#0b2f66] py-3 text-center text-xs font-bold uppercase tracking-wider text-white"
                >
                  Logout
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
