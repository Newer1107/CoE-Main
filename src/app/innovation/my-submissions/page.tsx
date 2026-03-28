import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/jwt';
import MySubmissionsClient from './MySubmissionsClient';

export default async function MySubmissionsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  if (!token) redirect('/login');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    redirect('/login');
  }

  if (payload.role !== 'STUDENT') redirect('/login');

  return <MySubmissionsClient />;
}
