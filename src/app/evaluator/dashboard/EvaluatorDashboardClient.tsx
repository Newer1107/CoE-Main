"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ToastProvider';

type RubricItem = {
  id: number;
  label: string;
};

type ScoreRow = {
  rubricItemId: number;
  score: number;
};

type StudentRow = {
  registrationId: number;
  name: string;
  email: string;
  scored: boolean;
  scores: ScoreRow[];
};

type TrackGroup = {
  id: number;
  name: string;
  room: string | null;
  students: StudentRow[];
};

type Payload = {
  event: { id: number; title: string };
  rubricItems: RubricItem[];
  tracks: TrackGroup[];
};

async function apiCall<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.message || `Request failed (${response.status})`);
  }
  return payload.data as T;
}

export default function EvaluatorDashboardClient() {
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Payload | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const next = await apiCall<Payload>('/api/committee/evaluator/students');
      setData(next);
    } catch (err) {
      setData(null);
      pushToast(err instanceof Error ? err.message : 'Failed to load students.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const totalStudents = useMemo(() => {
    if (!data) return 0;
    return data.tracks.reduce((acc, track) => acc + track.students.length, 0);
  }, [data]);

  return (
    <main className="max-w-6xl mx-auto px-4 md:px-8 pt-[120px] pb-12 min-h-screen">
      <h1 className="font-headline text-4xl text-[#002155]">Evaluator Dashboard</h1>
      <p className="mt-2 text-sm text-[#434651]">{data?.event.title || 'Committee Event'} • {totalStudents} students</p>

      {loading ? <p className="mt-4 text-sm text-[#434651]">Loading...</p> : null}

      {!loading && !data ? (
        <section className="mt-6 border border-[#c4c6d3] bg-white p-5">
          <p className="text-sm text-[#434651]">No active event data available.</p>
        </section>
      ) : null}

      {!loading && data ? (
        <div className="mt-6 space-y-4">
          {data.tracks.map((track) => (
            <section key={track.id} className="border border-[#c4c6d3] bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-headline text-2xl text-[#002155]">{track.name}</h2>
                <p className="text-xs text-[#434651]">Room: {track.room || 'TBD'}</p>
              </div>

              {track.students.length === 0 ? (
                <p className="mt-3 text-sm text-[#434651]">No students registered in this track.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-[#f5f4f0]">
                        <th className="border border-[#c4c6d3] p-2 text-left">Student</th>
                        <th className="border border-[#c4c6d3] p-2 text-left">Status</th>
                        <th className="border border-[#c4c6d3] p-2 text-left">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {track.students.map((student) => (
                        <tr key={student.registrationId}>
                          <td className="border border-[#c4c6d3] p-2">
                            {student.name}
                            <div className="text-xs text-[#747782]">{student.email}</div>
                          </td>
                          <td className="border border-[#c4c6d3] p-2">
                            {student.scored ? (
                              <span className="inline-block bg-[#d8f3dc] text-[#0b6b2e] px-2 py-1 text-xs font-bold">Scored</span>
                            ) : (
                              <span className="inline-block bg-[#fff4cc] text-[#8c4f00] px-2 py-1 text-xs font-bold">Pending</span>
                            )}
                          </td>
                          <td className="border border-[#c4c6d3] p-2">
                            <Link
                              href={`/evaluator/score/${student.registrationId}`}
                              className="border border-[#002155] px-3 py-1 text-xs font-bold text-[#002155]"
                            >
                              Score Student
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
      ) : null}
    </main>
  );
}
