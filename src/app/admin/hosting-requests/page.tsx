import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/jwt';
import { getAdminHostingDashboardData } from '@/lib/project-hosting';
import AdminHostingRequestsClient from './AdminHostingRequestsClient';

export default async function AdminHostingRequestsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  if (!token) redirect('/login?next=%2Fadmin%2Fhosting-requests');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    redirect('/login?next=%2Fadmin%2Fhosting-requests');
  }

  if (payload.role !== 'ADMIN') {
    if (payload.role === 'FACULTY') redirect('/faculty');
    redirect('/facility-booking');
  }

  const data = await getAdminHostingDashboardData();
  return <AdminHostingRequestsClient initialData={data} />;
}
