'use client';

import { useRef, useState, useEffect } from 'react';

type ProblemQuestion = {
  id: number;
  questionText: string;
  questionType: 'SHORT_TEXT' | 'LONG_TEXT';
  isRequired: boolean;
  order: number;
};

type StudentProfile = {
  id: number;
  skills: string | null;
  experience: string | null;
  interests: string | null;
  resumeUrl: string | null;
  resumeFileName: string | null;
  isComplete: boolean;
  updatedAt: string;
};

interface ApplyModalProps {
  problemId: number;
  problemTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ApplyModal({ problemId, problemTitle, isOpen, onClose, onSuccess }: ApplyModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [questions, setQuestions] = useState<ProblemQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch profile
        const profileRes = await fetch('/api/profile');
        if (!profileRes.ok) {
          throw new Error('Failed to load profile');
        }
        const profileData = await profileRes.json();
        setProfile(profileData.data);

        // Fetch questions
        const questionsRes = await fetch(`/api/innovation/problems/${problemId}/questions`);
        if (!questionsRes.ok) {
          throw new Error('Failed to load questions');
        }
        const questionsData = await questionsRes.json();
        setQuestions(questionsData.data || []);
        
        // Initialize answers map
        const init: Record<number, string> = {};
        questionsData.data?.forEach((q: ProblemQuestion) => {
          init[q.id] = '';
        });
        setAnswers(init);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load application form');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen, problemId]);

  useEffect(() => {
    if (isOpen && !dialogRef.current?.open) {
      dialogRef.current?.showModal();
    }
  }, [isOpen]);

  const handleClose = () => {
    dialogRef.current?.close();
    onClose();
  };

  const handleDialogClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    const rect = dialogRef.current?.getBoundingClientRect();
    if (rect && (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)) {
      handleClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate all required questions are answered
    const missingAnswers = questions.filter((q) => q.isRequired && !answers[q.id]?.trim());
    if (missingAnswers.length > 0) {
      setError(`Please answer all required questions (${missingAnswers.length} remaining)`);
      return;
    }

    try {
      setSubmitting(true);

      const payload = {
        problemId,
        answers: questions.map((q) => ({
          questionId: q.id,
          answerText: answers[q.id] || '',
        })),
      };

      const res = await fetch('/api/innovation/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Failed to submit application');
      }

      handleClose();
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error submitting application');
    } finally {
      setSubmitting(false);
    }
  };

  const daysAgoUpdated = profile?.updatedAt ? Math.floor((Date.now() - new Date(profile.updatedAt).getTime()) / (1000 * 60 * 60 * 24)) : null;

  return (
    <dialog
      ref={dialogRef}
      onClick={handleDialogClick}
      onClose={handleClose}
      className="max-w-2xl m-auto rounded-lg shadow-lg backdrop:bg-black/50 p-6 max-h-[90vh] overflow-y-auto"
    >
      {loading ? (
        <div className="text-center py-8">
          <p className="text-[#434651]">Loading application form...</p>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-[#002155]">Apply for Problem</h2>
            <p className="text-sm text-[#434651] mt-1">{problemTitle}</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Profile Confirmation Section */}
            <div className="border border-[#c4c6d3] p-4 rounded bg-[#f9f8f4]">
              <h3 className="font-bold text-sm text-[#002155] mb-3">Profile Information</h3>
              <div className="space-y-2 text-sm">
                <p className="text-[#434651]">
                  ✓ <span className="font-medium">Skills:</span> {profile?.skills || 'Not specified'}
                </p>
                <p className="text-[#434651]">
                  ✓ <span className="font-medium">Experience:</span> {profile?.experience || 'Not specified'}
                </p>
                <p className="text-[#434651]">
                  ✓ <span className="font-medium">Interests:</span> {profile?.interests || 'Not specified'}
                </p>
                {profile?.resumeFileName && (
                  <p className="text-[#434651]">
                    ✓ <span className="font-medium">Resume:</span> {profile.resumeFileName}
                  </p>
                )}
                {daysAgoUpdated && daysAgoUpdated > 30 && (
                  <p className="text-yellow-700 text-xs mt-2">
                    ⚠️ Profile last updated {daysAgoUpdated} days ago
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  handleClose();
                  window.location.href = '/profile';
                }}
                className="mt-3 text-xs text-[#002155] underline font-medium hover:text-[#003380]"
              >
                Update Profile
              </button>
            </div>

            {/* Custom Questions Section */}
            {questions.length > 0 && (
              <div className="border border-[#c4c6d3] p-4 rounded">
                <h3 className="font-bold text-sm text-[#002155] mb-4">Questions</h3>
                <div className="space-y-4">
                  {questions.map((question, idx) => (
                    <div key={question.id}>
                      <label className="block text-sm font-medium text-[#002155] mb-2">
                        {idx + 1}. {question.questionText}
                        {question.isRequired && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      {question.questionType === 'SHORT_TEXT' ? (
                        <input
                          type="text"
                          value={answers[question.id] || ''}
                          onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}
                          className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm focus:outline-none focus:border-[#fd9923] focus:ring-1 focus:ring-[#fd9923]/50"
                          placeholder="Enter your answer"
                          required={question.isRequired}
                        />
                      ) : (
                        <textarea
                          value={answers[question.id] || ''}
                          onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}
                          className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm focus:outline-none focus:border-[#fd9923] focus:ring-1 focus:ring-[#fd9923]/50"
                          placeholder="Enter your answer"
                          rows={4}
                          required={question.isRequired}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Form Actions */}
            <div className="flex gap-3 pt-4 border-t border-[#c4c6d3] justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 border border-[#c4c6d3] text-[#434651] rounded font-medium hover:bg-[#f5f4f0] transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2 bg-[#fd9923] text-white rounded font-medium hover:bg-[#e68a00] disabled:opacity-50 transition-colors text-sm"
              >
                {submitting ? 'Submitting...' : 'Confirm & Apply'}
              </button>
            </div>
          </form>
        </>
      )}
    </dialog>
  );
}
