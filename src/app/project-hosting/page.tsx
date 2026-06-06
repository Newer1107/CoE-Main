import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/jwt';
import { getStudentHostingDashboardData } from '@/lib/project-hosting';
import ProjectHostingClient from './ProjectHostingClient';

export default async function ProjectHostingPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  if (!token) redirect('/login?next=%2Fproject-hosting');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    redirect('/login?next=%2Fproject-hosting');
  }

  if (payload.role !== 'STUDENT') redirect('/facility-booking');

  const data = await getStudentHostingDashboardData(payload.id);
  return <ProjectHostingClient initialData={data} />;
}
