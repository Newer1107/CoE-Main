import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/jwt';
import ProfileClient from './ProfileClient';

export default async function ProfilePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  if (!token) redirect('/login?next=%2Fprofile');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    redirect('/login?next=%2Fprofile');
  }

  if (payload.role !== 'STUDENT') redirect('/facility-booking');

  return <ProfileClient />;
}
