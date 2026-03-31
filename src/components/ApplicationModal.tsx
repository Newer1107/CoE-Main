'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Question {
  id: number;
  questionText: string;
  type: string;
}

interface ApplicationModalProps {
  problemId: number;
  problemTitle: string;
  questions: Question[];
  onClose: () => void;
}

export function ApplicationModal({ problemId, problemTitle, questions, onClose }: ApplicationModalProps) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileStatus, setProfileStatus] = useState<{
    isComplete: boolean;
    exists: boolean;
  } | null>(null);

  useEffect(() => {
    // Check profile completion
    const checkProfile = async () => {
      try {
        const res = await fetch('/api/profile/check-completion');
        if (res.ok) {
          const data = await res.json();
          setProfileStatus({
            isComplete: data.data.isComplete,
            exists: data.data.profileExists,
          });
        }
      } catch (err) {
        console.error('Error checking profile:', err);
        setError('Failed to check profile status');
      }
    };

    checkProfile();
  }, []);

  if (profileStatus === null) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center">
        <div className="bg-white rounded-lg p-6">Loading...</div>
      </div>
    );
  }

  if (!profileStatus.isComplete) {
    return (
      <>
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-xl font-bold text-gray-800">Complete Your Profile First</h2>
            <p className="text-gray-600">
              You need to complete your profile (skills, experience, interests, and resume) before applying to problems.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onClose();
                  router.push('/innovation/profile');
                }}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Complete Profile
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate all answers filled
    if (Object.keys(answers).length !== questions.length) {
      setError('Please answer all questions');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/innovation/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemId,
          answers: questions.map((q) => ({
            questionId: q.id,
            answerText: answers[q.id],
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.message || 'Failed to submit application');
        return;
      }

      // Success
      onClose();
      router.push('/innovation/applications?success=1');
    } catch (err) {
      setError('Error submitting application');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full my-8 p-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">{problemTitle}</h2>
          <p className="text-gray-600 mb-6">Please answer the following questions:</p>

          {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            {questions.map((q) => (
              <div key={q.id}>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {q.questionText}
                  <span className="text-red-500 ml-1">*</span>
                </label>
                {q.type === 'LONG_TEXT' ? (
                  <textarea
                    value={answers[q.id] || ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="Your answer..."
                    rows={4}
                    className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                ) : (
                  <input
                    type="text"
                    value={answers[q.id] || ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="Your answer..."
                    className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                )}
              </div>
            ))}

            <div className="flex gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
              >
                {loading ? 'Submitting...' : 'Submit Application'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
