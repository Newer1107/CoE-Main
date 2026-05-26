'use client';

import { useState } from 'react';

type CreateProblemModalProps = {
  canCreate: boolean;
};

type CreateProblemResponse = {
  data?: {
    id: number;
  };
  message?: string;
};

export default function CreateFacultyProblemModal({ canCreate }: CreateProblemModalProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [supportDocument, setSupportDocument] = useState<File | null>(null);
  const [questions, setQuestions] = useState<Array<{ questionText: string; type: 'TEXT' | 'LONG_TEXT' }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!canCreate) return null;

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setTags('');
    setSupportDocument(null);
    setQuestions([]);
    setError(null);
    setSuccess(null);
  };

  const handleCreate = async () => {
    setError(null);

    if (!title.trim() || !description.trim()) {
      setError('Title and description are required.');
      return;
    }

    if (supportDocument && supportDocument.type !== 'application/pdf') {
      setError('Support document must be a PDF file.');
      return;
    }

    const normalizedQuestions = questions
      .map((question) => ({
        questionText: question.questionText.trim(),
        type: question.type,
      }))
      .filter((question) => question.questionText.length > 0);

    if (normalizedQuestions.some((question) => question.questionText.length < 5)) {
      setError('Each custom question must be at least 5 characters long.');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.set('title', title.trim());
      formData.set('description', description.trim());
      if (tags.trim()) {
        formData.set('tags', tags.trim());
      }
      formData.set('mode', 'OPEN');
      formData.set('problemType', 'FACULTY_INTERNSHIP');
      formData.set('isIndustryProblem', 'false');
      if (supportDocument) {
        formData.set('supportDocument', supportDocument);
      }
      if (normalizedQuestions.length > 0) {
        formData.set('questions', JSON.stringify(normalizedQuestions));
      }

      const res = await fetch('/api/innovation/problems', {
        method: 'POST',
        body: formData,
      });

      const payload = (await res.json()) as CreateProblemResponse;
      if (!res.ok) {
        throw new Error(payload?.message || 'Failed to create faculty internship');
      }

      resetForm();
      setSuccess('Faculty internship created successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create faculty internship');
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
        Create Faculty Internship
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded bg-white p-5 shadow-xl border border-[#c4c6d3]">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-bold text-[#002155]">Create Faculty Internship</h3>
                <p className="text-xs text-[#747782] mt-1">
                  Publish a new faculty internship and open applications for faculty members.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-sm text-[#434651]"
                aria-label="Close create internship dialog"
              >
                Close
              </button>
            </div>

            {error && (
              <div className="mb-3 p-3 border border-red-200 bg-red-50 text-red-700 text-xs rounded">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-3 p-3 border border-green-200 bg-green-50 text-green-700 text-xs rounded">
                {success}
              </div>
            )}

            <div className="space-y-3">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Internship title"
                className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm"
              />
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Internship description"
                className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm min-h-[120px]"
              />
              <input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="Tags (comma-separated)"
                className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm"
              />
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-[#747782] mb-2">
                  Support Document (PDF, optional)
                </label>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(event) => setSupportDocument(event.target.files?.[0] ?? null)}
                  className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm"
                />
              </div>
              <div className="border border-[#c4c6d3] rounded p-3">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <label className="text-xs font-semibold uppercase tracking-wide text-[#747782]">
                    Custom Application Questions (Optional)
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setQuestions((prev) => [...prev, { questionText: '', type: 'TEXT' }])
                    }
                    className="px-2 py-1 text-[11px] font-semibold border border-[#002155] text-[#002155] rounded"
                  >
                    Add Question
                  </button>
                </div>
                {questions.length === 0 ? (
                  <p className="text-xs text-[#747782]">No custom questions added.</p>
                ) : (
                  <div className="space-y-3">
                    {questions.map((question, idx) => (
                      <div key={idx} className="border border-[#e4e5ec] rounded p-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-[#002155]">Question {idx + 1}</p>
                          <button
                            type="button"
                            onClick={() => setQuestions((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-[11px] text-red-700 font-semibold"
                          >
                            Remove
                          </button>
                        </div>
                        <input
                          value={question.questionText}
                          onChange={(event) =>
                            setQuestions((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, questionText: event.target.value } : item
                              )
                            )
                          }
                          placeholder="Enter question text"
                          className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm mb-2"
                        />
                        <select
                          value={question.type}
                          onChange={(event) =>
                            setQuestions((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, type: event.target.value as 'TEXT' | 'LONG_TEXT' } : item
                              )
                            )
                          }
                          className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm"
                        >
                          <option value="TEXT">Short text</option>
                          <option value="LONG_TEXT">Long text</option>
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
