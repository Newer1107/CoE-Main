"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavUser = {
  name: string;
  email: string;
  role: string;
  uid?: string;
} | null;

type SubNavLink = {
  href: string;
  label: string;
  requiresAuth: boolean;
};

const VERTICAL_LINKS: SubNavLink[] = [
  { href: "/hackathons/browse", label: "Browse Events", requiresAuth: false },
  { href: "/hackathons/external", label: "Opportunities", requiresAuth: false },
  { href: "/hackathons/learn", label: "Learning", requiresAuth: false },
];

/**
 * Hackathon vertical sub-navigation.
 * Editorial treatment: serif section wordmark, hairline divider, sans label
 * links with gold underline active state (mirrors the main navbar), and a
 * distinct outlined "My Portal" button for signed-in users. Single-line
 * scrollable strip on mobile.
 */
export default function HackathonsNav({ user }: { user: NavUser }) {
  const pathname = usePathname();
  const isLoggedIn = Boolean(user);

  const visibleLinks = VERTICAL_LINKS.filter(
    (link) => !link.requiresAuth || isLoggedIn
  );

  return (
    <nav className="border-b border-hairline bg-white" aria-label="Hackathons sections">
      <div className="mx-auto flex max-w-6xl items-center gap-x-3 px-4 md:gap-x-4 md:px-8">
        {/* Section wordmark */}
        <Link
          href="/hackathons"
          className={`shrink-0 py-2.5 font-headline text-lg font-bold tracking-tight transition-colors ${
            pathname === "/hackathons" ? "text-primary" : "text-primary/80 hover:text-primary"
          }`}
        >
          Hackathons
        </Link>

        <span aria-hidden="true" className="h-4 w-px shrink-0 bg-outline-variant" />

        {/* Section links — wrap instead of hidden overflow: at any zoom or
            width (incl. logged-in CTA) every link stays visible and clickable */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1">
          {visibleLinks.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={`whitespace-nowrap px-2.5 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-colors md:px-3 ${
                  isActive
                    ? "text-primary underline decoration-secondary-container decoration-2 underline-offset-8"
                    : "text-muted hover:text-primary"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Signed-in hub button */}
        {isLoggedIn ? (
          <Link
            href="/hackathons/portal"
            className={`ml-auto shrink-0 px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors ${
              pathname === "/hackathons/portal" || pathname.startsWith("/hackathons/portal/")
                ? "bg-primary text-white"
                : "border border-primary text-primary hover:bg-primary hover:text-white"
            }`}
          >
            My Portal
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
