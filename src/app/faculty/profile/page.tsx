import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAccessToken } from "@/lib/jwt";
import FacultyProfileClient from "./FacultyProfileClient";

export default async function FacultyProfilePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;

  if (!token) redirect("/login?next=%2Ffaculty%2Fprofile");

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    redirect("/login?next=%2Ffaculty%2Fprofile");
  }

  if (payload.role !== "FACULTY") redirect("/faculty");

  return <FacultyProfileClient />;
}
