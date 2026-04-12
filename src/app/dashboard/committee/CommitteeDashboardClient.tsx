"use client";

import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ToastProvider';

type Track = {
  id: number;
  name: string;
  room: string | null;
};

type ActiveEvent = {
  id: number;
  title: string;
  tracks: Track[];
};

type Registration = {
  id: number;
  track: Track;
  eventTitle: string;
  evaluation: {
    allRubricsScored: boolean;
    weightedPercentage: number | null;
  };
};

async function apiCall<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const err = new Error(payload?.message || `Request failed (${response.status})`);
    (err as any).status = response.status;
    throw err;
  }
  return payload.data as T;
}

export default function CommitteeDashboardClient() {
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [eventResult, registrationResult] = await Promise.allSettled([
        apiCall<ActiveEvent | null>('/api/committee/event'),
        apiCall<Registration>('/api/committee/my-registration'),
      ]);

      if (eventResult.status === 'fulfilled') {
        setActiveEvent(eventResult.value);
      } else {
        setActiveEvent(null);
      }

      if (registrationResult.status === 'fulfilled') {
        setRegistration(registrationResult.value);
      } else {
        setRegistration(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (activeEvent?.tracks?.length) {
      setSelectedTrackId(activeEvent.tracks[0].id);
    }
  }, [activeEvent?.id]);

  const selectedTrack = useMemo(
    () => activeEvent?.tracks.find((track) => track.id === selectedTrackId) || null,
    [activeEvent, selectedTrackId],
  );

  const register = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTrackId) return;

    setSubmitting(true);
    try {
      await apiCall('/api/committee/register', {
        method: 'POST',
        body: JSON.stringify({ trackId: selectedTrackId }),
      });

      pushToast('Registered successfully.', 'success');
      await load();
    } catch (err: any) {
      if (err?.status === 409) {
        pushToast('You are already registered.', 'info');
      } else {
        pushToast(err instanceof Error ? err.message : 'Registration failed.', 'error');
      }
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-8 pt-[120px] pb-12 min-h-screen">
      <h1 className="font-headline text-4xl text-[#002155]">Committee Evaluation</h1>

      {loading ? <p className="mt-4 text-sm text-[#434651]">Loading...</p> : null}

      {!loading && !activeEvent ? (
        <section className="mt-6 border border-[#c4c6d3] bg-white p-5">
          <p className="text-sm text-[#434651]">No evaluation scheduled.</p>
        </section>
      ) : null}

      {!loading && activeEvent && !registration ? (
        <section className="mt-6 border border-[#c4c6d3] bg-white p-5">
          <h2 className="font-headline text-2xl text-[#002155]">{activeEvent.title}</h2>
          <p className="mt-2 text-sm text-[#434651]">Select your track to register for committee evaluation.</p>

          <form className="mt-4 space-y-3" onSubmit={register}>
            <select
              className="w-full border border-[#747782] p-2 text-sm"
              value={selectedTrackId ?? ''}
              onChange={(e) => setSelectedTrackId(Number(e.target.value))}
              required
            >
              {activeEvent.tracks.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.name}
                </option>
              ))}
            </select>

            {selectedTrack ? (
              <p className="text-xs text-[#434651]">
                Room: {selectedTrack.room || 'Room will be announced shortly.'}
              </p>
            ) : null}

            <button type="submit" disabled={submitting} className="bg-[#002155] text-white px-4 py-2 text-xs font-bold">
              {submitting ? 'Registering...' : 'Register'}
            </button>
          </form>
        </section>
      ) : null}

      {!loading && registration ? (
        <section className="mt-6 border border-[#c4c6d3] bg-white p-5">
          <p className="text-xs uppercase tracking-widest text-[#0b6b2e] font-bold">Registered</p>
          <h2 className="font-headline text-2xl text-[#002155] mt-1">{registration.eventTitle}</h2>
          <p className="mt-3 text-sm text-[#434651]">
            Track: <span className="font-semibold text-[#002155]">{registration.track.name}</span>
          </p>
          <p className="mt-1 text-sm text-[#434651]">
            Room: <span className="font-semibold text-[#002155]">{registration.track.room || 'Room will be announced shortly.'}</span>
          </p>

          <div className="mt-4 border border-[#c4c6d3] bg-[#faf9f5] p-3">
            <p className="text-xs uppercase tracking-widest text-[#747782]">Evaluation Result</p>
            {registration.evaluation.allRubricsScored ? (
              <p className="mt-1 text-sm text-[#434651]">
                Final Weighted Score:{' '}
                <span className="font-semibold text-[#002155]">
                  {registration.evaluation.weightedPercentage ?? 0}%
                </span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-[#434651]">Your evaluation is in progress. Final score will be visible once completed.</p>
            )}
          </div>
        </section>
      ) : null}
    </main>
  );
}
