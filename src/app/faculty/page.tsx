import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAccessToken } from "@/lib/jwt";
import FacultyPortalClient from "./FacultyPortalClient";

export default async function FacultyPortalPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;

  if (!token) {
    redirect("/login?next=%2Ffaculty");
  }

  try {
    const payload = verifyAccessToken(token);
    if (payload.role !== "FACULTY" && payload.role !== "ADMIN") {
      redirect("/facility-booking");
    }
  } catch {
    redirect("/login?next=%2Ffaculty");
  }

  return <FacultyPortalClient />;
}
