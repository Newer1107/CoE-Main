"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ToastProvider';

type RubricItem = {
  id: number;
  label: string;
  maxScore: number;
  weight: number;
};

type ScoreRow = {
  rubricItemId: number;
  score: number;
  feedback: string | null;
};

type StudentRow = {
  registrationId: number;
  name: string;
  email: string;
  scores: ScoreRow[];
};

type TrackGroup = {
  id: number;
  name: string;
  students: StudentRow[];
};

type Payload = {
  event: { id: number; title: string };
  rubricItems: RubricItem[];
  tracks: TrackGroup[];
};

type FormRow = {
  rubricItemId: number;
  label: string;
  maxScore: number;
  weight: number;
  score: string;
  feedback: string;
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
    throw new Error(payload?.message || `Request failed (${response.status})`);
  }

  return payload.data as T;
}

export default function EvaluatorScoreClient({ registrationId }: { registrationId: number }) {
  const router = useRouter();
  const { pushToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [studentName, setStudentName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [trackName, setTrackName] = useState('');
  const [formRows, setFormRows] = useState<FormRow[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiCall<Payload>('/api/committee/evaluator/students');
      setEventTitle(data.event.title);

      let foundStudent: StudentRow | null = null;
      let foundTrack: TrackGroup | null = null;

      for (const track of data.tracks) {
        const student = track.students.find((row) => row.registrationId === registrationId);
        if (student) {
          foundStudent = student;
          foundTrack = track;
          break;
        }
      }

      if (!foundStudent || !foundTrack) {
        pushToast('Student registration not found for active event.', 'error');
        router.push('/evaluator/dashboard');
        return;
      }

      setStudentName(foundStudent.name);
      setStudentEmail(foundStudent.email);
      setTrackName(foundTrack.name);

      const scoreMap = new Map(foundStudent.scores.map((score) => [score.rubricItemId, score]));
      setFormRows(
        data.rubricItems.map((item) => ({
          rubricItemId: item.id,
          label: item.label,
          maxScore: item.maxScore,
          weight: item.weight,
          score: typeof scoreMap.get(item.id)?.score === 'number' ? String(scoreMap.get(item.id)?.score) : '',
          feedback: scoreMap.get(item.id)?.feedback || '',
        })),
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to load scoring form.', 'error');
      router.push('/evaluator/dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!Number.isInteger(registrationId) || registrationId <= 0) {
      pushToast('Invalid registration id.', 'error');
      router.push('/evaluator/dashboard');
      return;
    }
    void load();
  }, [registrationId]);

  const invalidReason = useMemo(() => {
    for (const row of formRows) {
      if (row.score.trim() === '') return `Please enter score for ${row.label}.`;
      const numeric = Number(row.score);
      if (!Number.isFinite(numeric) || numeric < 0) return `Invalid score for ${row.label}.`;
      if (numeric > row.maxScore) return `${row.label} cannot exceed ${row.maxScore}.`;
    }
    return null;
  }, [formRows]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (invalidReason) {
      pushToast(invalidReason, 'error');
      return;
    }

    setSaving(true);
    try {
      await apiCall('/api/committee/evaluator/score', {
        method: 'POST',
        body: JSON.stringify({
          registrationId,
          scores: formRows.map((row) => ({
            rubricItemId: row.rubricItemId,
            score: Number(row.score),
            feedback: row.feedback.trim() || null,
          })),
        }),
      });

      pushToast('Scores submitted successfully.', 'success');
      router.push('/evaluator/dashboard');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to submit scores.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-8 pt-[120px] pb-12 min-h-screen">
      <h1 className="font-headline text-4xl text-[#002155]">Score Student</h1>
      {eventTitle ? <p className="mt-2 text-sm text-[#434651]">{eventTitle}</p> : null}

      {loading ? <p className="mt-4 text-sm text-[#434651]">Loading scoring form...</p> : null}

      {!loading ? (
        <section className="mt-6 border border-[#c4c6d3] bg-white p-5">
          <p className="text-sm text-[#434651]">Student: <span className="font-semibold text-[#002155]">{studentName}</span> ({studentEmail})</p>
          <p className="text-sm text-[#434651] mt-1">Track: <span className="font-semibold text-[#002155]">{trackName}</span></p>

          <form className="mt-4 space-y-4" onSubmit={submit}>
            {formRows.map((row, index) => (
              <div key={row.rubricItemId} className="border border-[#c4c6d3] p-3 bg-[#faf9f5]">
                <p className="text-sm font-semibold text-[#002155]">{row.label}</p>
                <p className="text-xs text-[#434651] mt-1">Max score: {row.maxScore} | Weight: {row.weight}</p>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input
                    type="number"
                    min={0}
                    max={row.maxScore}
                    value={row.score}
                    onChange={(e) =>
                      setFormRows((prev) => prev.map((item, i) => (i === index ? { ...item, score: e.target.value } : item)))
                    }
                    className="border border-[#747782] p-2 text-sm"
                    placeholder="Score"
                    required
                  />
                  <input
                    value={row.feedback}
                    onChange={(e) =>
                      setFormRows((prev) => prev.map((item, i) => (i === index ? { ...item, feedback: e.target.value } : item)))
                    }
                    className="md:col-span-2 border border-[#747782] p-2 text-sm"
                    placeholder="Optional feedback"
                  />
                </div>
              </div>
            ))}

            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="bg-[#002155] text-white px-4 py-2 text-xs font-bold">
                {saving ? 'Submitting...' : 'Submit Scores'}
              </button>
              <button type="button" onClick={() => router.push('/evaluator/dashboard')} className="border border-[#747782] px-4 py-2 text-xs font-bold text-[#434651]">
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </main>
  );
}
