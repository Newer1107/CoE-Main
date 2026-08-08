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
  { href: "/hackathons/portal", label: "My Portal", requiresAuth: true },
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
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-0.5 px-4 md:px-8">
        {/* Section wordmark */}
        <Link
          href="/hackathons"
          className={`shrink-0 py-3 font-headline text-lg font-bold tracking-tight transition-colors ${
            pathname === "/hackathons" ? "text-primary" : "text-primary/80 hover:text-primary"
          }`}
        >
          Hackathons
        </Link>

        <span aria-hidden="true" className="h-5 w-px shrink-0 bg-outline-variant" />

        {/* Section links */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">
          {visibleLinks.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={`shrink-0 whitespace-nowrap border-b-2 px-2.5 py-3 text-xs font-bold uppercase tracking-wider transition-colors md:px-3 ${
                  isActive
                    ? "border-secondary-container text-primary"
                    : "border-transparent text-muted hover:text-primary"
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
            className={`ml-auto shrink-0 border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
              pathname === "/hackathons/portal" || pathname.startsWith("/hackathons/portal/")
                ? "bg-primary text-white"
                : "border-primary text-primary hover:bg-primary hover:text-white"
            }`}
          >
            My Portal
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
