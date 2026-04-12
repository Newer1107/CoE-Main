"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type NavbarProps = {
  user: {
    name: string;
    email: string;
    role: string;
    uid?: string;
  } | null;
};

type NavLink = {
  label: string;
  href: string;
};

function isActive(pathname: string, href: string) {
  if (href.startsWith("/#")) return false;
  return pathname === href;
}

export default function Navbar({ user }: NavbarProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<"programs" | "resources" | "workspace" | null>(null);

  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const currentPathWithSearch = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  const loginHref = `/login?next=${encodeURIComponent(currentPathWithSearch)}`;
  const bookingLoginHref = `/login?next=${encodeURIComponent("/facility-booking")}&reason=booking-auth-required`;

  const userRole = user?.role || null;
  const isLoggedIn = Boolean(user);

  const canSeeFacultyPortal = userRole === "FACULTY" || userRole === "ADMIN";
  const canSeeAdminPanel = userRole === "ADMIN";
  const canSeeCommitteeAdmin = userRole === "ADMIN";
  const canSeeCommitteeStudent = userRole === "STUDENT";
  const canSeeEvaluatorDashboard = userRole === "EVALUATOR";

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

  const programsLinks: NavLink[] = [
    { label: "Innovation", href: "/innovation" },
    { label: "Laboratory", href: "/laboratory" },
  ];

  const resourcesLinks: NavLink[] = [
    { label: "Events", href: "/#events" },
    { label: "Grants", href: "/#grants" },
    { label: "News", href: "/#news" },
    { label: "About", href: "/about" },
  ];

  const workspaceLinks = useMemo(() => {
    const links: NavLink[] = [];
    if (canSeeFacultyPortal) links.push({ label: "Faculty Portal", href: "/faculty" });
    if (canSeeAdminPanel) links.push({ label: "Admin Panel", href: "/admin" });
    if (canSeeCommitteeAdmin) links.push({ label: "Committee Admin", href: "/admin/committee" });
    if (canSeeCommitteeStudent) links.push({ label: "Committee", href: "/dashboard/committee" });
    if (canSeeEvaluatorDashboard) links.push({ label: "Evaluator", href: "/evaluator/dashboard" });
    return links;
  }, [canSeeFacultyPortal, canSeeAdminPanel, canSeeCommitteeAdmin, canSeeCommitteeStudent, canSeeEvaluatorDashboard]);

  const userQuickLinks = useMemo(() => {
    const links: NavLink[] = [];
    if (canSeeCommitteeAdmin) links.push({ label: "Committee Admin", href: "/admin/committee" });
    if (canSeeEvaluatorDashboard) links.push({ label: "Evaluator Dashboard", href: "/evaluator/dashboard" });
    if (canSeeCommitteeStudent) links.push({ label: "Committee", href: "/dashboard/committee" });
    if (canSeeAdminPanel) links.push({ label: "Hackathon Control Center", href: "/admin?tab=innovation" });
    if (userRole === "STUDENT") {
      links.push({ label: "My Profile", href: "/profile" });
      links.push({ label: "My Applications", href: "/innovation/my-applications" });
      links.push({ label: "My Submissions", href: "/innovation/my-submissions" });
    }
    links.push({ label: "My Booking Area", href: "/facility-booking" });
    return links;
  }, [canSeeCommitteeAdmin, canSeeEvaluatorDashboard, canSeeCommitteeStudent, canSeeAdminPanel, userRole]);

  return (
    <>
      <div
        className={`bg-[#705e49] flex items-center px-4 md:px-6 py-2 w-full z-[60] fixed top-0 border-none font-['Inter'] text-xs font-bold uppercase tracking-wider text-white marquee-scroll transition-all duration-300 ${isScrolled ? "-translate-y-full opacity-0 pointer-events-none" : "translate-y-0 opacity-100"}`}
      >
        <div className="marquee-content ml-2 sm:ml-4">
          <span>Solve real-world industry problems and gain recognition</span>
          <span>Open Problem Statements available — Register your team now</span>
          <span>Build your portfolio with live projects and hackathons</span>
          <span>Explore grants, events & innovation opportunities</span>
        </div>
      </div>

      <nav
        className={`flex justify-between items-center w-full px-4 md:px-8 z-50 fixed border-none transition-all duration-300 ${isScrolled
          ? "top-0 bg-[#001a42]/92 backdrop-blur-md py-3 shadow-[0_8px_24px_rgba(0,24,61,0.25)]"
          : "top-[32px] bg-[#002155] py-4 shadow-md"
          }`}
      >
        <div className="flex items-center gap-4 md:gap-5 z-50">
          <Link href="/" className="shrink-0 flex items-center justify-center group">
            <Image
              src="/coe-logo.jpeg"
              alt="CoE Logo"
              width={80}
              height={80}
              priority
              className="object-contain w-12 h-10 md:w-16 md:h-12 transition-transform group-hover:scale-105"
            />
          </Link>

          <Link href="/" className="text-lg md:text-xl font-bold text-white tracking-tighter uppercase flex flex-col leading-tight">
            <span className="font-multiple">TCET CENTRE OF EXCELLENCE</span>
            <span className="text-[8px] md:text-[10px] tracking-[0.2em] font-label opacity-90 hidden sm:block">
              For Research Culture & Development
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-6 z-50">
          <div className="hidden lg:flex items-center gap-3">
            <Link
              href="/"
              className={`${isActive(pathname, "/") ? "text-[#fd9923] font-bold" : "text-white opacity-85 hover:opacity-100 hover:text-[#fd9923]"} transition-all px-2 text-xs font-['Inter'] uppercase tracking-[0.05rem]`}
            >
              Home
            </Link>

            <DesktopDropdown
              title="Programs"
              links={programsLinks}
              pathname={pathname}
              isOpen={openDropdown === "programs"}
              onOpen={() => setOpenDropdown("programs")}
              onToggle={() => setOpenDropdown((prev) => (prev === "programs" ? null : "programs"))}
              onClose={() => setOpenDropdown(null)}
            />

            <DesktopDropdown
              title="Resources"
              links={resourcesLinks}
              pathname={pathname}
              isOpen={openDropdown === "resources"}
              onOpen={() => setOpenDropdown("resources")}
              onToggle={() => setOpenDropdown((prev) => (prev === "resources" ? null : "resources"))}
              onClose={() => setOpenDropdown(null)}
            />

            {workspaceLinks.length > 0 ? (
              <DesktopDropdown
                title="Workspace"
                links={workspaceLinks}
                pathname={pathname}
                isOpen={openDropdown === "workspace"}
                onOpen={() => setOpenDropdown("workspace")}
                onToggle={() => setOpenDropdown((prev) => (prev === "workspace" ? null : "workspace"))}
                onClose={() => setOpenDropdown(null)}
              />
            ) : null}

            <Link
              href={bookFacilityHref}
              className="bg-[#fd9923] hover:bg-[#8c4f00] px-3 py-2 text-[#002155] hover:text-white transition-colors text-[10px] font-bold uppercase tracking-[0.1rem]"
            >
              Book Facility
            </Link>

            {!isLoggedIn ? (
              <Link
                href={loginHref}
                className="text-white opacity-85 hover:opacity-100 hover:text-[#fd9923] transition-all px-2 text-xs font-['Inter'] uppercase tracking-[0.05rem]"
              >
                Login
              </Link>
            ) : null}

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
                  <div className="absolute right-0 top-[110%] w-[280px] border border-[#c4c6d3] bg-white p-3 shadow-lg">
                    <p className="text-[10px] uppercase tracking-widest text-[#747782]">Signed In</p>
                    <p className="mt-1 text-sm font-bold text-[#002155]">{user?.name}</p>
                    <p className="mt-1 text-xs text-[#434651]">{user?.email}</p>
                    <p className="mt-1 text-xs text-[#434651]">Role: {user?.role}</p>

                    <div className="mt-3 grid grid-cols-1 gap-2">
                      {userQuickLinks.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          onClick={() => setIsUserMenuOpen(false)}
                          className="border border-[#002155] px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-[#002155] hover:bg-[#002155] hover:text-white transition-colors"
                        >
                          {link.label}
                        </Link>
                      ))}
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

          <div className="shrink-0 flex items-center justify-center ml-2 sm:ml-4">
            <Image
              src="/tcetlogo.png"
              alt="TCET Logo"
              width={64}
              height={48}
              priority
              className="object-contain w-12 h-10 md:w-16 md:h-12"
            />
          </div>

          <button
            className="lg:hidden text-white p-2 hover:bg-[#003580] rounded transition-colors"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          >
            <span className="material-symbols-outlined text-2xl">{isMobileMenuOpen ? "close" : "menu"}</span>
          </button>
        </div>
      </nav>

      <div
        className={`fixed inset-0 bg-[#002155] z-40 lg:hidden flex flex-col pt-24 px-6 transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex flex-col gap-6 w-full h-full overflow-y-auto pb-8 custom-scrollbar">
          {isLoggedIn ? (
            <div className="border border-white/25 bg-white/10 p-4 text-white">
              <p className="text-[10px] uppercase tracking-widest text-white/70">Signed In</p>
              <p className="mt-1 text-sm font-bold">{user?.name}</p>
              <p className="mt-1 text-xs text-white/80">{user?.email}</p>
              <p className="mt-1 text-xs text-white/80">Role: {user?.role}</p>
            </div>
          ) : null}

          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-[0.15em] text-white/60">Main</p>
            <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className="block text-white text-sm uppercase tracking-wider">Home</Link>
            <Link href="/about" onClick={() => setIsMobileMenuOpen(false)} className="block text-white text-sm uppercase tracking-wider">About</Link>
          </div>

          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-[0.15em] text-white/60">Programs</p>
            {programsLinks.map((link) => (
              <Link key={link.href} href={link.href} onClick={() => setIsMobileMenuOpen(false)} className="block text-white text-sm uppercase tracking-wider">
                {link.label}
              </Link>
            ))}
          </div>

          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-[0.15em] text-white/60">Resources</p>
            {resourcesLinks.map((link) => (
              <Link key={link.href} href={link.href} onClick={() => setIsMobileMenuOpen(false)} className="block text-white text-sm uppercase tracking-wider">
                {link.label}
              </Link>
            ))}
          </div>

          {workspaceLinks.length > 0 ? (
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-[0.15em] text-white/60">Workspace</p>
              {workspaceLinks.map((link) => (
                <Link key={link.href} href={link.href} onClick={() => setIsMobileMenuOpen(false)} className="block text-white text-sm uppercase tracking-wider">
                  {link.label}
                </Link>
              ))}
            </div>
          ) : null}

          {!isLoggedIn ? (
            <Link
              href={bookFacilityHref}
              onClick={() => setIsMobileMenuOpen(false)}
              className="inline-block w-full text-center bg-[#fd9923] hover:bg-[#8c4f00] py-3 text-[#002155] hover:text-white font-bold text-sm uppercase tracking-widest transition-colors"
            >
              Book Facility
            </Link>
          ) : null}

          {!isLoggedIn ? (
            <Link
              href={loginHref}
              onClick={() => setIsMobileMenuOpen(false)}
              className="inline-block w-full text-center bg-[#fd9923] hover:bg-[#8c4f00] py-3 text-[#002155] hover:text-white font-bold text-sm uppercase tracking-widest transition-colors"
            >
              Login
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="inline-block w-full text-center bg-[#0b2f66] py-3 text-white font-bold text-sm uppercase tracking-widest"
            >
              Logout
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function DesktopDropdown({
  title,
  links,
  pathname,
  isOpen,
  onOpen,
  onToggle,
  onClose,
}: {
  title: string;
  links: NavLink[];
  pathname: string;
  isOpen: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onClose: () => void;
}) {
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    onOpen();
  };

  const handleMouseLeave = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      onClose();
    }, 140);
  };

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  return (
    <div className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <button
        type="button"
        onMouseEnter={handleMouseEnter}
        onClick={onToggle}
        className="text-white opacity-85 hover:opacity-100 hover:text-[#fd9923] transition-all px-2 text-xs font-['Inter'] uppercase tracking-[0.05rem] flex items-center gap-1"
      >
        {title}
        <span className="material-symbols-outlined text-base">expand_more</span>
      </button>

      {isOpen ? (
        <div className="absolute left-0 top-full mt-1 min-w-[220px] border border-[#c4c6d3] bg-white shadow-lg p-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`block px-3 py-2 text-xs uppercase tracking-wider ${isActive(pathname, link.href) ? "text-[#002155] font-bold" : "text-[#434651] hover:bg-[#f5f4f0]"}`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
