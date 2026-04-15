"use client";

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useToast } from '@/components/ToastProvider';

type InnovationProgramDetailClientProps = {
  programId: string;
  isLoggedIn: boolean;
  initialInterestCount: number;
  initialInterested: boolean;
};

export default function InnovationProgramDetailClient({
  programId,
  isLoggedIn,
  initialInterestCount,
  initialInterested,
}: InnovationProgramDetailClientProps) {
  const pathname = usePathname();
  const { pushToast } = useToast();
  const [interestCount, setInterestCount] = useState(initialInterestCount);
  const [isInterested, setIsInterested] = useState(initialInterested);
  const [busy, setBusy] = useState(false);

  const handleToggleInterest = async () => {
    if (!isLoggedIn) {
      window.location.href = `/login?next=${encodeURIComponent(pathname || `/innovation/programs/${programId}`)}`;
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/innovation/programs/${programId}/interest`, {
        method: isInterested ? 'DELETE' : 'POST',
      });
      const payload = (await res.json()) as {
        success: boolean;
        message: string;
        data?: { interestCount: number; isInterested: boolean };
      };

      if (!res.ok || !payload.success || !payload.data) {
        throw new Error(payload.message || 'Failed to update interest');
      }

      setInterestCount(payload.data.interestCount);
      setIsInterested(payload.data.isInterested);
      pushToast(payload.message || 'Interest updated');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not update interest', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 border border-[#c4c6d3] bg-white p-5">
      <p className="text-xs uppercase tracking-widest text-[#434651]">Interested Users</p>
      <p className="mt-2 text-2xl font-bold text-[#002155]">{interestCount}</p>

      <button
        type="button"
        onClick={handleToggleInterest}
        disabled={busy}
        className="mt-4 px-4 py-2 text-xs font-bold uppercase tracking-wider bg-[#002155] text-white disabled:opacity-60"
      >
        {busy ? 'Updating...' : isInterested ? 'Interested ✓' : "I'm Interested"}
      </button>
    </section>
  );
}
