'use client';

import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ToastProvider';

type ProblemQuestion = {
  id: number;
  questionText: string;
  type: 'TEXT' | 'LONG_TEXT';
};

interface FacultyApplyModalProps {
  problemId: number;
  problemTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function FacultyApplyModal({
  problemId,
  problemTitle,
  isOpen,
  onClose,
  onSuccess,
}: FacultyApplyModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ProblemQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const { pushToast } = useToast();

  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const questionsRes = await fetch(`/api/innovation/problems/${problemId}/questions`);
        if (!questionsRes.ok) {
          throw new Error('Failed to load questions');
        }
        const questionsData = await questionsRes.json();
        setQuestions(questionsData.data || []);

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

  useEffect(() => {
    if (!isOpen) return;

    const scrollY = window.scrollY;

    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';

    return () => {
      const y = document.body.style.top;

      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';

      if (y) {
        window.scrollTo(0, parseInt(y || '0') * -1);
      }
    };
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

    const missingAnswers = questions.filter((q) => !answers[q.id]?.trim());
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
      pushToast(`Successfully applied to "${problemTitle}"`, 'success');
      onSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error submitting application';
      setError(message);
      pushToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

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
            <h2 className="text-2xl font-bold text-[#002155]">Apply for Internship</h2>
            <p className="text-sm text-[#434651] mt-1">{problemTitle}</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {questions.length > 0 ? (
              <div className="border border-[#c4c6d3] p-4 rounded">
                <h3 className="font-bold text-sm text-[#002155] mb-4">Questions</h3>
                <div className="space-y-4">
                  {questions.map((question, idx) => (
                    <div key={question.id}>
                      <label className="block text-sm font-medium text-[#002155] mb-2">
                        {idx + 1}. {question.questionText}
                        <span className="text-red-500 ml-1">*</span>
                      </label>
                      {question.type === 'TEXT' ? (
                        <input
                          type="text"
                          value={answers[question.id] || ''}
                          onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}
                          className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm focus:outline-none focus:border-[#fd9923] focus:ring-1 focus:ring-[#fd9923]/50"
                          placeholder="Enter your answer"
                          required
                        />
                      ) : (
                        <textarea
                          value={answers[question.id] || ''}
                          onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}
                          className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm focus:outline-none focus:border-[#fd9923] focus:ring-1 focus:ring-[#fd9923]/50"
                          placeholder="Enter your answer"
                          rows={4}
                          required
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-[#434651]">No additional questions for this internship.</p>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm font-semibold border border-[#c4c6d3] text-[#434651] rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-semibold bg-[#002155] text-white rounded"
              >
                {submitting ? 'Submitting...' : 'Submit Application'}
              </button>
            </div>
          </form>
        </>
      )}
    </dialog>
  );
}
