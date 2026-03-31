'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface ProfileCheckData {
  profileExists: boolean;
  isComplete: boolean;
  profile: {
    id: number;
    skills: string | null;
    experience: string | null;
    interests: string | null;
    resumeUrl: string | null;
  } | null;
}

export function ProfileCompletionBanner() {
  const [checkData, setCheckData] = useState<ProfileCheckData | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const checkProfile = async () => {
      try {
        const res = await fetch('/api/profile/check-completion');
        if (res.ok) {
          const data = await res.json();
          setCheckData(data.data);
        }
      } catch (err) {
        console.error('Error checking profile:', err);
      }
    };

    checkProfile();
  }, []);

  if (dismissed || !checkData || checkData.isComplete) {
    return null;
  }

  return (
    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <p className="text-sm font-medium text-yellow-800">
            Complete your profile to apply for open problems
          </p>
          <p className="mt-1 text-sm text-yellow-700">
            Your profile (skills, experience, interests, and resume) will be reused for all applications.
          </p>
          <div className="mt-3 flex gap-3">
            <Link
              href="/innovation/profile"
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-yellow-800 bg-yellow-100 rounded hover:bg-yellow-200"
            >
              Complete Profile
            </Link>
            <button
              onClick={() => setDismissed(true)}
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-yellow-700 hover:text-yellow-800"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
