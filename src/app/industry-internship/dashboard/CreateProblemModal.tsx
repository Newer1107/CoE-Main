'use client';

import { useState } from 'react';

type CreateProblemModalProps = {
  canCreate: boolean;
  industryName: string | null;
};

type CreateProblemResponse = {
  data?: {
    id: number;
  };
  message?: string;
};

export default function CreateProblemModal({ canCreate, industryName }: CreateProblemModalProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!canCreate) return null;

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setTags('');
    setError(null);
  };

  const handleCreate = async () => {
    setError(null);

    if (!title.trim() || !description.trim()) {
      setError('Title and description are required.');
      return;
    }

    if (!industryName) {
      setError('Industry name is missing for this account. Contact admin.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/innovation/problems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          tags: tags.trim() || undefined,
          mode: 'OPEN',
          problemType: 'INTERNSHIP',
          isIndustryProblem: true,
          industryName,
        }),
      });

      const payload = (await res.json()) as CreateProblemResponse;
      if (!res.ok) {
        throw new Error(payload?.message || 'Failed to create problem statement');
      }

      resetForm();
      setOpen(false);
      if (payload?.data?.id) {
        window.location.href = `/industry-internship/${payload.data.id}`;
      } else {
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create problem statement');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => {
          resetForm();
          setOpen(true);
        }}
        className="px-4 py-2 text-xs font-semibold bg-[#002155] text-white rounded"
      >
        Create Problem Statement
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded bg-white p-5 shadow-xl border border-[#c4c6d3]">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-bold text-[#002155]">Create Problem Statement</h3>
                <p className="text-xs text-[#747782] mt-1">
                  Publish a new internship problem statement and open a workspace for applications.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-sm text-[#434651]"
                aria-label="Close create problem dialog"
              >
                Close
              </button>
            </div>

            {error && (
              <div className="mb-3 p-3 border border-red-200 bg-red-50 text-red-700 text-xs rounded">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Problem title"
                className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm"
              />
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Problem description"
                className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm min-h-[120px]"
              />
              <input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="Tags (comma-separated)"
                className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={handleCreate}
                  disabled={loading}
                  className="flex-1 px-4 py-2 text-sm font-semibold bg-[#002155] text-white rounded"
                >
                  {loading ? 'Creating...' : 'Create'}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 text-sm font-semibold border border-[#c4c6d3] text-[#434651] rounded"
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
