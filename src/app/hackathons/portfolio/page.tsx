'use client';

import { useCallback, useEffect, useState } from 'react';
import CountUp from '@/components/CountUp';

type ApiResponse<T> = { success: boolean; message: string; data: T | null };

type ParticipatedEntry = {
  eventId: number;
  eventTitle: string;
  eventType?: string | null;
  claimStatus: string;
  finalScore: number | null;
  teamName?: string | null;
};

type AwardEntry = {
  eventId: number;
  eventTitle: string;
  finalScore: number | null;
};

type CertificateEntry = {
  eventId: number;
  eventTitle: string;
};

type AttendanceEntry = {
  eventTitle: string;
  presentCount: number;
  totalSessions: number;
};

type PortfolioData = {
  totals: {
    participated: number;
    awards: number;
    certificates: number;
    avgScore: number;
  };
  participated: ParticipatedEntry[];
  awards: AwardEntry[];
  certificates: CertificateEntry[];
  attendance: AttendanceEntry[];
};

const EMPTY_DATA: PortfolioData = {
  totals: { participated: 0, awards: 0, certificates: 0, avgScore: 0 },
  participated: [],
  awards: [],
  certificates: [],
  attendance: [],
};

const CLAIM_STATUS_STYLES: Record<string, string> = {
  ACCEPTED: 'border-[#0b6b2e] bg-[#f0faf2] text-[#0b6b2e]',
  PENDING: 'border-[#8a5a00] bg-[#fdf6ec] text-[#8a5a00]',
  REJECTED: 'border-[#991b1b] bg-[#fdf2f2] text-[#991b1b]',
};

const claimStatusStyle = (status: string): string =>
  CLAIM_STATUS_STYLES[status] ?? 'border-[#747782] bg-surface-container text-on-surface-variant';

const formatScore = (score: number | null): string => (score == null ? '—' : `${score}`);

export default function PortfolioPage() {
  // Consolidated into /hackathons/portal (single hub).
  if (typeof window !== "undefined") {
    window.location.replace("/hackathons/portal");
  }

  const [data, setData] = useState<PortfolioData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/profile/innovation-portfolio', { credentials: 'include' });
        const json = (await res.json()) as ApiResponse<PortfolioData>;
        if (!json.success) throw new Error(json.message || 'Failed to load portfolio.');
        if (!cancelled) setData(json.data ?? EMPTY_DATA);
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : 'Failed to load portfolio.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const renderEmpty = useCallback((label: string) => (
    <div className="border border-dashed border-outline-variant bg-surface p-8 text-center">
      <p className="text-sm font-semibold text-primary">Nothing here yet</p>
      <p className="mt-1 text-xs text-[#747782]">{label}</p>
    </div>
  ), []);

  return (
    <main className="mx-auto min-h-screen max-w-[1560px] px-4 pb-14 md:px-8">
      <header className="mb-8 border-l-4 border-primary pl-4 md:pl-6">
        <h1 className="font-headline text-3xl font-bold leading-none tracking-tight text-primary md:text-[40px]">
          My Innovation Portfolio
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-on-surface-variant">
          Your hackathon journey — participation, awards, certificates and attendance across every event you&apos;ve joined.
        </p>
      </header>

      {errorMessage ? (
        <div className="mb-6 max-w-4xl border border-[#991b1b] bg-[#fdf2f2] p-4 text-sm text-[#991b1b]">
          {errorMessage}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-[#747782]">Loading portfolio…</p>
      ) : (
        <div className="space-y-10">
          {/* Stat cards */}
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="border border-outline-variant bg-white p-5 md:p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#747782]">Participated</p>
              <p className="mt-2 font-headline text-4xl font-bold text-primary md:text-5xl">
                <CountUp value={data.totals.participated} />
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">events joined</p>
            </div>
            <div className="border border-outline-variant bg-white p-5 md:p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#747782]">Awards</p>
              <p className="mt-2 font-headline text-4xl font-bold text-secondary md:text-5xl">
                <CountUp value={data.totals.awards} />
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">accepted claims</p>
            </div>
            <div className="border border-outline-variant bg-white p-5 md:p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#747782]">Certificates</p>
              <p className="mt-2 font-headline text-4xl font-bold text-primary md:text-5xl">
                <CountUp value={data.totals.certificates} />
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">earned</p>
            </div>
            <div className="border border-outline-variant bg-white p-5 md:p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#747782]">Avg Score</p>
              <p className="mt-2 font-headline text-4xl font-bold text-secondary md:text-5xl">
                <CountUp value={data.totals.avgScore} duration={900} />
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">across scored events</p>
            </div>
          </section>

          {/* Awards */}
          <section>
            <h2 className="mb-4 font-headline text-2xl font-bold text-primary">Awards</h2>
            {data.awards.length === 0 ? (
              renderEmpty('Win or get selected in a hackathon and your awards will show up here.')
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {data.awards.map((award) => (
                  <div key={award.eventId} className="flex items-center justify-between border border-outline-variant bg-white p-5">
                    <div>
                      <p className="font-headline text-lg font-bold leading-snug text-primary">{award.eventTitle}</p>
                      <p className="mt-1 text-xs uppercase tracking-wider text-secondary">Award</p>
                    </div>
                    <span className="rounded-full border border-[#8c4f00] bg-[#fdf6ec] px-3 py-1 text-sm font-bold text-secondary">
                      {formatScore(award.finalScore)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Certificates */}
          <section>
            <h2 className="mb-4 font-headline text-2xl font-bold text-primary">Certificates</h2>
            {data.certificates.length === 0 ? (
              renderEmpty('Certificates for completed events will be listed here once issued.')
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {data.certificates.map((certificate) => (
                  <div key={certificate.eventId} className="flex items-center justify-between border border-outline-variant bg-white p-5">
                    <p className="font-headline text-lg font-bold leading-snug text-primary">{certificate.eventTitle}</p>
                    <span className="rounded-full bg-success px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
                      Earned
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Participated */}
          <section>
            <h2 className="mb-4 font-headline text-2xl font-bold text-primary">Participated</h2>
            {data.participated.length === 0 ? (
              renderEmpty('Join a hackathon team to see your participation history here.')
            ) : (
              <div className="overflow-hidden border border-outline-variant bg-white">
                <div className="hidden grid-cols-12 gap-4 border-b border-outline-variant bg-surface-container px-5 py-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant md:grid">
                  <span className="col-span-6">Event</span>
                  <span className="col-span-3">Claim Status</span>
                  <span className="col-span-3 text-right">Final Score</span>
                </div>
                <ul className="divide-y divide-[#e3e2df]">
                  {data.participated.map((entry) => (
                    <li key={entry.eventId} className="grid grid-cols-1 gap-2 px-5 py-4 md:grid-cols-12 md:items-center md:gap-4">
                      <div className="md:col-span-6">
                        <p className="font-headline text-base font-bold text-primary">{entry.eventTitle}</p>
                        {entry.teamName ? <p className="mt-0.5 text-xs text-[#747782]">Team: {entry.teamName}</p> : null}
                      </div>
                      <div className="md:col-span-3">
                        <span className={`inline-block rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${claimStatusStyle(entry.claimStatus)}`}>
                          {entry.claimStatus}
                        </span>
                      </div>
                      <div className="md:col-span-3 md:text-right">
                        <span className="text-sm font-bold text-primary">{formatScore(entry.finalScore)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Attendance */}
          <section>
            <h2 className="mb-4 font-headline text-2xl font-bold text-primary">Attendance</h2>
            {data.attendance.length === 0 ? (
              renderEmpty('Session-wise attendance for hackathon selection programs will appear here.')
            ) : (
              <div className="space-y-4">
                {data.attendance.map((entry, index) => {
                  const percentage =
                    entry.totalSessions > 0 ? Math.min(100, Math.round((entry.presentCount / entry.totalSessions) * 100)) : 0;
                  return (
                    <div key={`${entry.eventTitle}-${index}`} className="border border-outline-variant bg-white p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-headline text-base font-bold text-primary">{entry.eventTitle}</p>
                        <p className="text-xs font-semibold text-on-surface-variant">
                          {entry.presentCount} / {entry.totalSessions} sessions
                          <span className="ml-2 text-secondary">{percentage}%</span>
                        </p>
                      </div>
                      <div className="mt-3 h-2 w-full bg-[#e3e2df]">
                        <div className="h-2 bg-primary" style={{ width: `${percentage}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
