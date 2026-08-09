import { redirect } from 'next/navigation';

export const metadata = {
  title: "My Profile | TCET Centre of Excellence",
};

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  // Profile lives inside the portal hub now — keep old links working.
  redirect("/hackathons/portal#my-profile");
}
