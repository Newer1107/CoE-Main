import { redirect } from 'next/navigation';

export const metadata = {
  title: "My Profile | TCET Centre of Excellence",
};

export const dynamic = "force-dynamic";

export default async function InnovationProfilePage() {
  // Profile lives inside the portal hub now — keep problem-flow links working.
  redirect("/hackathons/portal#my-profile");
}
