"use client";

import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ToastProvider';

type TrackRow = {
  id: number;
  name: string;
  room: string | null;
  _count: { registrations: number };
};

type RubricItem = {
  id?: number;
  label: string;
  maxScore: number;
  weight: number;
  order: number;
};

type AdminEventResponse = {
  id: number;
  title: string;
  isActive: boolean;
  rubricLocked: boolean;
  tracks: TrackRow[];
  rubricItems: RubricItem[];
};

type ScoreDetail = {
  rubricItemId: number;
  rubricItemLabel: string;
  score: number;
  maxScore: number;
  weight: number;
  evaluator: { id: number; name: string; email: string };
};

type ResultRow = {
  registrationId: number;
  student: { id: number; name: string; email: string };
  track: { id: number; name: string; room: string | null };
  totalScore: number;
  weightedPercentage: number;
  allRubricsScored: boolean;
  scores: ScoreDetail[];
};

type AdminResultsResponse = {
  rubricItems: Array<{ id: number; label: string; maxScore: number; weight: number; order: number }>;
  registrations: ResultRow[];
};

const jsonHeaders = { 'Content-Type': 'application/json' };

async function apiCall<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options?.body ? jsonHeaders : {}),
      ...(options?.headers || {}),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.message || `Request failed (${response.status})`);
  }

  return payload.data as T;
}

export default function AdminCommitteeClient() {
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [eventData, setEventData] = useState<AdminEventResponse | null>(null);
  const [resultsData, setResultsData] = useState<AdminResultsResponse | null>(null);

  const [eventTitle, setEventTitle] = useState('');
  const [trackDraft, setTrackDraft] = useState('');
  const [trackNames, setTrackNames] = useState<string[]>(['']);

  const [evaluatorName, setEvaluatorName] = useState('');
  const [evaluatorEmail, setEvaluatorEmail] = useState('');
  const [evaluatorPassword, setEvaluatorPassword] = useState('');

  const [rubricItems, setRubricItems] = useState<RubricItem[]>([{ label: '', maxScore: 10, weight: 1, order: 0 }]);

  const refresh = async () => {
    setLoading(true);
    try {
      const [eventResp, resultsResp] = await Promise.allSettled([
        apiCall<AdminEventResponse | null>('/api/committee/admin/event'),
        apiCall<AdminResultsResponse>('/api/committee/admin/results'),
      ]);

      if (eventResp.status === 'fulfilled') {
        const data = eventResp.value;
        setEventData(data);
        if (data?.rubricItems?.length) {
          setRubricItems(data.rubricItems.map((item, index) => ({ ...item, order: index })));
        }
      } else {
        setEventData(null);
      }

      if (resultsResp.status === 'fulfilled') {
        setResultsData(resultsResp.value);
      } else {
        setResultsData(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const addTrackRow = () => setTrackNames((prev) => [...prev, '']);

  const updateTrackRow = (index: number, value: string) => {
    setTrackNames((prev) => prev.map((row, i) => (i === index ? value : row)));
  };

  const removeTrackRow = (index: number) => {
    setTrackNames((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const createEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const names = trackNames.map((name) => name.trim()).filter(Boolean);
      await apiCall('/api/committee/admin/event', {
        method: 'POST',
        body: JSON.stringify({ title: eventTitle.trim(), tracks: names }),
      });
      pushToast('Committee event created.', 'success');
      setEventTitle('');
      setTrackNames(['']);
      await refresh();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to create event.', 'error');
    }
  };

  const updateTrackRoom = async (trackId: number, room: string) => {
    try {
      await apiCall(`/api/committee/admin/tracks/${trackId}`, {
        method: 'PATCH',
        body: JSON.stringify({ room }),
      });
      pushToast('Track room updated.', 'success');
      await refresh();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to update room.', 'error');
    }
  };

  const createEvaluator = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await apiCall('/api/committee/admin/evaluators', {
        method: 'POST',
        body: JSON.stringify({
          name: evaluatorName.trim(),
          email: evaluatorEmail.trim(),
          password: evaluatorPassword,
        }),
      });

      pushToast('Evaluator account created.', 'success');
      setEvaluatorName('');
      setEvaluatorEmail('');
      setEvaluatorPassword('');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to create evaluator.', 'error');
    }
  };

  const addRubricItem = () => {
    setRubricItems((prev) => [...prev, { label: '', maxScore: 10, weight: 1, order: prev.length }]);
  };

  const moveRubric = (index: number, direction: -1 | 1) => {
    setRubricItems((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next.map((item, i) => ({ ...item, order: i }));
    });
  };

  const removeRubric = (index: number) => {
    setRubricItems((prev) => prev.filter((_, i) => i !== index).map((item, i) => ({ ...item, order: i })));
  };

  const updateRubric = (index: number, patch: Partial<RubricItem>) => {
    setRubricItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const saveRubric = async () => {
    if (!eventData) {
      pushToast('Create an event first.', 'error');
      return;
    }

    try {
      const items = rubricItems.map((item, index) => ({
        label: item.label.trim(),
        maxScore: Number(item.maxScore),
        weight: Number(item.weight),
        order: index,
      }));

      await apiCall('/api/committee/admin/rubric', {
        method: 'PUT',
        body: JSON.stringify({ eventId: eventData.id, items }),
      });

      pushToast('Rubric saved.', 'success');
      await refresh();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to save rubric.', 'error');
    }
  };

  const csvRows = useMemo(() => {
    if (!resultsData) return [];
    const rubricById = new Map(resultsData.rubricItems.map((item) => [item.id, item.label]));

    const rows = resultsData.registrations.map((registration) => {
      const row: Record<string, string | number> = {
        Student: registration.student.name,
        Email: registration.student.email,
        Track: registration.track.name,
        Room: registration.track.room || '',
        'Weighted Score (%)': registration.weightedPercentage,
        Completed: registration.allRubricsScored ? 'Yes' : 'No',
      };

      for (const rubricItem of resultsData.rubricItems) {
        const relevant = registration.scores.filter((score) => score.rubricItemId === rubricItem.id);
        row[`Rubric: ${rubricById.get(rubricItem.id) || rubricItem.label}`] = relevant
          .map((score) => `${score.evaluator.name}: ${score.score}/${score.maxScore} (w:${score.weight})`)
          .join(' | ');
      }

      return row;
    });

    return rows;
  }, [resultsData]);

  const exportCsv = () => {
    if (csvRows.length === 0) {
      pushToast('No results available to export.', 'info');
      return;
    }

    const headers = Object.keys(csvRows[0]);
    const escapeCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const lines = [
      headers.map(escapeCell).join(','),
      ...csvRows.map((row) => headers.map((header) => escapeCell(row[header] ?? '')).join(',')),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'committee-results.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="max-w-6xl mx-auto px-4 md:px-8 pt-[120px] pb-12 min-h-screen">
      <h1 className="font-headline text-4xl text-[#002155]">Committee Administration</h1>
      <p className="mt-2 text-sm text-[#434651]">One-time committee evaluation setup and scoring oversight.</p>

      {loading ? <p className="mt-6 text-sm text-[#434651]">Loading committee module...</p> : null}

      <section className="mt-8 border border-[#c4c6d3] bg-white p-5">
        <h2 className="font-headline text-2xl text-[#002155]">Create Event</h2>
        <form className="mt-4 space-y-3" onSubmit={createEvent}>
          <input
            value={eventTitle}
            onChange={(e) => setEventTitle(e.target.value)}
            placeholder="Event title"
            className="w-full border border-[#747782] p-2 text-sm"
            required
          />

          <div className="space-y-2">
            {trackNames.map((name, index) => (
              <div key={index} className="flex gap-2">
                <input
                  value={name}
                  onChange={(e) => updateTrackRow(index, e.target.value)}
                  placeholder={`Track ${index + 1}`}
                  className="flex-1 border border-[#747782] p-2 text-sm"
                  required
                />
                <button type="button" onClick={() => removeTrackRow(index)} className="border border-[#747782] px-3 text-xs">
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={addTrackRow} className="border border-[#002155] px-3 py-2 text-xs font-bold text-[#002155]">
              Add Track
            </button>
            <button type="submit" className="bg-[#002155] text-white px-4 py-2 text-xs font-bold">
              Create Active Event
            </button>
          </div>
        </form>
      </section>

      {eventData ? (
        <section className="mt-6 border border-[#c4c6d3] bg-white p-5">
          <h2 className="font-headline text-2xl text-[#002155]">Tracks and Rooms</h2>
          <p className="mt-1 text-sm text-[#434651]">Active event: {eventData.title}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#f5f4f0]">
                  <th className="border border-[#c4c6d3] p-2 text-left">Track</th>
                  <th className="border border-[#c4c6d3] p-2 text-left">Room</th>
                  <th className="border border-[#c4c6d3] p-2 text-left">Registered</th>
                  <th className="border border-[#c4c6d3] p-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {eventData.tracks.map((track) => (
                  <TrackRoomRow key={track.id} track={track} onSave={updateTrackRoom} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="mt-6 border border-[#c4c6d3] bg-white p-5">
        <h2 className="font-headline text-2xl text-[#002155]">Create Evaluator Account</h2>
        <form className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3" onSubmit={createEvaluator}>
          <input value={evaluatorName} onChange={(e) => setEvaluatorName(e.target.value)} placeholder="Name" className="border border-[#747782] p-2 text-sm" required />
          <input value={evaluatorEmail} onChange={(e) => setEvaluatorEmail(e.target.value)} placeholder="Email" className="border border-[#747782] p-2 text-sm" required type="email" />
          <input value={evaluatorPassword} onChange={(e) => setEvaluatorPassword(e.target.value)} placeholder="Password" className="border border-[#747782] p-2 text-sm" required type="password" />
          <button type="submit" className="bg-[#002155] text-white text-xs font-bold">Create Evaluator</button>
        </form>
      </section>

      <section className="mt-6 border border-[#c4c6d3] bg-white p-5">
        <h2 className="font-headline text-2xl text-[#002155]">Rubric Builder</h2>
        {eventData?.rubricLocked ? <p className="mt-2 text-sm text-red-700">Rubric locked: scoring has already begun.</p> : null}
        <div className="mt-4 space-y-2">
          {rubricItems.map((item, index) => (
            <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
              <input
                value={item.label}
                onChange={(e) => updateRubric(index, { label: e.target.value })}
                className="md:col-span-5 border border-[#747782] p-2 text-sm"
                placeholder="Criterion label"
                disabled={Boolean(eventData?.rubricLocked)}
              />
              <input
                type="number"
                value={item.maxScore}
                onChange={(e) => updateRubric(index, { maxScore: Number(e.target.value) })}
                className="md:col-span-2 border border-[#747782] p-2 text-sm"
                min={1}
                disabled={Boolean(eventData?.rubricLocked)}
                placeholder="Max"
              />
              <input
                type="number"
                value={item.weight}
                onChange={(e) => updateRubric(index, { weight: Number(e.target.value) })}
                className="md:col-span-2 border border-[#747782] p-2 text-sm"
                min={0.1}
                step={0.1}
                disabled={Boolean(eventData?.rubricLocked)}
                placeholder="Weight"
              />
              <div className="md:col-span-3 flex gap-2">
                <button type="button" onClick={() => moveRubric(index, -1)} className="border border-[#747782] px-3 text-xs" disabled={Boolean(eventData?.rubricLocked)}>Up</button>
                <button type="button" onClick={() => moveRubric(index, 1)} className="border border-[#747782] px-3 text-xs" disabled={Boolean(eventData?.rubricLocked)}>Down</button>
                <button type="button" onClick={() => removeRubric(index)} className="border border-[#747782] px-3 text-xs" disabled={Boolean(eventData?.rubricLocked)}>Remove</button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex gap-2">
          <button type="button" onClick={addRubricItem} className="border border-[#002155] px-3 py-2 text-xs font-bold text-[#002155]" disabled={Boolean(eventData?.rubricLocked)}>
            Add Rubric Item
          </button>
          <button type="button" onClick={saveRubric} className="bg-[#002155] text-white px-4 py-2 text-xs font-bold" disabled={Boolean(eventData?.rubricLocked)}>
            Save Rubric
          </button>
        </div>
      </section>

      <section className="mt-6 border border-[#c4c6d3] bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-headline text-2xl text-[#002155]">Results</h2>
          <button type="button" onClick={exportCsv} className="border border-[#002155] px-3 py-2 text-xs font-bold text-[#002155]">
            Export CSV
          </button>
        </div>

        {resultsData?.registrations?.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#f5f4f0]">
                  <th className="border border-[#c4c6d3] p-2 text-left">Student</th>
                  <th className="border border-[#c4c6d3] p-2 text-left">Track</th>
                  <th className="border border-[#c4c6d3] p-2 text-left">Scores</th>
                  <th className="border border-[#c4c6d3] p-2 text-left">Weighted (%)</th>
                </tr>
              </thead>
              <tbody>
                {resultsData.registrations.map((row) => (
                  <tr key={row.registrationId}>
                    <td className="border border-[#c4c6d3] p-2">{row.student.name}<br /><span className="text-xs text-[#747782]">{row.student.email}</span></td>
                    <td className="border border-[#c4c6d3] p-2">{row.track.name}</td>
                    <td className="border border-[#c4c6d3] p-2">
                      {row.scores.length === 0 ? 'No scores yet' : row.scores.map((score, idx) => (
                        <div key={idx} className="text-xs mb-1">
                          <strong>{score.rubricItemLabel}</strong>: {score.score}/{score.maxScore} (w:{score.weight}) by {score.evaluator.name}
                        </div>
                      ))}
                    </td>
                    <td className="border border-[#c4c6d3] p-2 font-bold">
                      {row.allRubricsScored ? `${row.weightedPercentage}%` : 'In progress'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-[#434651]">No results available yet.</p>
        )}
      </section>
    </main>
  );
}

function TrackRoomRow({
  track,
  onSave,
}: {
  track: TrackRow;
  onSave: (trackId: number, room: string) => Promise<void>;
}) {
  const [room, setRoom] = useState(track.room || '');

  useEffect(() => {
    setRoom(track.room || '');
  }, [track.id, track.room]);

  return (
    <tr>
      <td className="border border-[#c4c6d3] p-2">{track.name}</td>
      <td className="border border-[#c4c6d3] p-2">
        <input value={room} onChange={(e) => setRoom(e.target.value)} className="w-full border border-[#747782] p-1 text-sm" placeholder="Room (optional)" />
      </td>
      <td className="border border-[#c4c6d3] p-2">{track._count.registrations}</td>
      <td className="border border-[#c4c6d3] p-2">
        <button type="button" className="border border-[#002155] px-3 py-1 text-xs font-bold text-[#002155]" onClick={() => void onSave(track.id, room)}>
          Save
        </button>
      </td>
    </tr>
  );
}
