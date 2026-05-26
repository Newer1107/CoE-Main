"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface FacultyProfileCheckData {
  profileExists: boolean;
  isComplete: boolean;
  profile: {
    id: number;
    department: string | null;
    designation: string | null;
    expertise: string | null;
    resumeUrl: string | null;
  } | null;
}

export function FacultyProfileCompletionModal() {
  const [checkData, setCheckData] = useState<FacultyProfileCheckData | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkProfile = async () => {
      try {
        const res = await fetch("/api/faculty/profile/check-completion");
        if (res.ok) {
          const data = await res.json();
          setCheckData(data.data);

          if (!data.data.isComplete) {
            setIsOpen(true);
          }
        }
      } catch (err) {
        console.error("Error checking faculty profile:", err);
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
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#002155]/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="bg-white w-full max-w-md border-t-8 border-[#0b6b2e] shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setIsOpen(false)}
          className="absolute top-4 right-4 z-10 bg-white/80 hover:bg-white p-2 rounded-full transition-colors"
        >
          <span className="material-symbols-outlined text-[#002155]">close</span>
        </button>

        <div className="p-6 md:p-8">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 bg-[#0b6b2e]/20 rounded-full flex items-center justify-center">
              <span className="material-symbols-outlined text-[#0b6b2e] text-2xl">badge</span>
            </div>
          </div>

          <h2 className="font-headline text-2xl text-[#002155] text-center mb-2">
            Complete Your Faculty Profile
          </h2>

          <p className="text-sm text-[#434651] text-center mb-4">
            Add your department, designation, expertise, and resume.
          </p>

          <p className="text-xs text-[#747782] text-center mb-6 leading-relaxed">
            This profile is used across faculty workflows and keeps your details consistent for reviews and collaborations.
          </p>

          <div className="flex gap-3">
            <button
              onClick={() => setIsOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-[#434651] bg-[#efeeea] rounded hover:bg-[#e0ded8] transition-colors"
            >
              Later
            </button>
            <Link
              href="/faculty/profile"
              onClick={() => setIsOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#0b6b2e] rounded hover:bg-[#0a5e29] transition-colors text-center"
            >
              Complete Profile
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
