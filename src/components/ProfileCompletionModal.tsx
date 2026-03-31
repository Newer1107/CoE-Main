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

export function ProfileCompletionModal() {
  const [checkData, setCheckData] = useState<ProfileCheckData | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkProfile = async () => {
      try {
        const res = await fetch('/api/profile/check-completion');
        if (res.ok) {
          const data = await res.json();
          setCheckData(data.data);

          // Show modal if profile is not complete
          if (!data.data.isComplete) {
            setIsOpen(true);
          }
        }
      } catch (err) {
        console.error('Error checking profile:', err);
      } finally {
        setLoading(false);
      }
    };

    checkProfile();
  }, []);

  if (loading || !isOpen || !checkData || checkData.isComplete) {
    return null;
  }

  return (
    <>
      {/* Modal Overlay */}
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#002155]/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={() => setIsOpen(false)}
      >
        {/* Modal Content */}
        <div
          className="bg-white w-full max-w-md border-t-8 border-[#fd9923] shadow-2xl relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close Button */}
          <button
            onClick={() => setIsOpen(false)}
            className="absolute top-4 right-4 z-10 bg-white/80 hover:bg-white p-2 rounded-full transition-colors"
          >
            <span className="material-symbols-outlined text-[#002155]">
              close
            </span>
          </button>

          <div className="p-6 md:p-8">
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-[#fd9923]/20 rounded-full flex items-center justify-center">
                <span className="material-symbols-outlined text-[#fd9923] text-2xl">person</span>
              </div>
            </div>

            {/* Title */}
            <h2 className="font-headline text-2xl text-[#002155] text-center mb-2">
              Complete Your Profile
            </h2>

            {/* Subtitle */}
            <p className="text-sm text-[#434651] text-center mb-4">
              Set up your profile to start applying for open problems
            </p>

            {/* Description */}
            <p className="text-xs text-[#747782] text-center mb-6 leading-relaxed">
              Your profile includes your skills, experience, interests, and resume. Once created, it will be reused for all applications—you only need to fill it once.
            </p>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setIsOpen(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-[#434651] bg-[#efeeea] rounded hover:bg-[#e0ded8] transition-colors"
              >
                Later
              </button>
              <Link
                href="/innovation/profile"
                onClick={() => setIsOpen(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#fd9923] rounded hover:bg-[#e68a00] transition-colors text-center"
              >
                Complete Profile
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

