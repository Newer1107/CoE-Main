import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAccessToken } from "@/lib/jwt";
import PortalClient from "./PortalClient";

export const metadata = {
  title: "My Portal | TCET Centre of Excellence",
  description:
    "Your single hub — profile, registrations, tickets, certificates and results in one place.",
};

export const dynamic = "force-dynamic";

export default async function HackathonPortalPage() {
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

  if (!user) {
    redirect("/login?next=/hackathons/portal");
  }

  return <PortalClient user={user} />;
}
