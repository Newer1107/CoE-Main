import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/jwt';
import MyApplicationsClient from './MyApplicationsClient';

export default async function MyApplicationsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  if (!token) redirect('/login?next=%2Finnovation%2Fmy-applications');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    redirect('/login?next=%2Finnovation%2Fmy-applications');
  }

  if (payload.role !== 'STUDENT') redirect('/facility-booking');

  return <MyApplicationsClient />;
}
