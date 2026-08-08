import { cookies } from "next/headers";
import { verifyAccessToken } from "@/lib/jwt";
import HackathonsNav from "./HackathonsNav";

/**
 * Hackathon vertical layout.
 *
 * The global navbar chrome is fixed: notice ticker (~32px) + top nav
 * (~72px mobile / ~80px desktop). This layout offsets its sub-navigation by
 * that fixed height so nothing hides under the navbar, and pages no longer
 * need their own pt-[120px] hack.
 */
export default async function HackathonsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;

  let user: { name: string; email: string; role: string; uid?: string } | null = null;
  if (token) {
    try {
      const payload = verifyAccessToken(token);
      user = {
        name: payload.name,
        email: payload.email,
        role: payload.role,
        uid: payload.uid,
      };
    } catch {
      user = null;
    }
  }

  return (
    <div className="min-h-screen bg-surface pt-[104px] md:pt-[112px]">
      <HackathonsNav user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
