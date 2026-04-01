'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface ApplicationData {
  id: number;
  status: 'SUBMITTED' | 'SELECTED' | 'REJECTED';
  createdAt: string;
  problem: {
    id: number;
    title: string;
  };
  answers: Array<{
    question: {
      id: number;
      questionText: string;
      questionType: string;
    };
    answerText: string;
  }>;
  feedback: string | null;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'SUBMITTED':
      return { color: 'bg-yellow-100 text-yellow-800', label: '🟡 Submitted', icon: '⏳' };
    case 'SELECTED':
      return { color: 'bg-green-100 text-green-800', label: '🟢 Selected', icon: '✓' };
    case 'REJECTED':
      return { color: 'bg-red-100 text-red-800', label: '🔴 Rejected', icon: '✕' };
    default:
      return { color: 'bg-gray-100 text-gray-800', label: status, icon: '?' };
  }
};

export default function MyApplicationsClient() {
  const [applications, setApplications] = useState<ApplicationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [selectedApp, setSelectedApp] = useState<ApplicationData | null>(null);

  useEffect(() => {
    const fetchApplications = async () => {
      try {
        const res = await fetch('/api/innovation/applications/my');
        if (res.ok) {
          const data = await res.json();
          setApplications(data.data || []);
        } else {
          setError('Failed to load applications');
        }
      } catch (err) {
        setError('Error loading applications');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    // Check for success param
    const params = new URLSearchParams(window.location.search);
    if (params.get('success')) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }

    fetchApplications();
  }, []);

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
        <div className="text-center text-[#434651]">Loading applications...</div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto mt-10 px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
      {/* Header */}
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-[#002155] leading-none">
          My Applications
        </h1>
        <p className="mt-2 text-[#434651] max-w-3xl font-body text-sm">
          Track the status of your open problem applications and view feedback from faculty
        </p>
      </header>

      {/* Success Message */}
      {success && (
        <div className="mb-6 p-4 bg-green-50 border-l-4 border-green-500 text-green-800 text-sm rounded">
          <p className="font-medium">✓ Application submitted successfully!</p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-800 text-sm rounded">
          <p className="font-medium">{error}</p>
        </div>
      )}

      {/* Empty State */}
      {applications.length === 0 ? (
        <div className="border border-dashed border-[#c4c6d3] bg-white p-8 rounded text-center">
          <p className="text-[#434651] font-medium mb-4">You haven't applied to any problems yet.</p>
          <Link
            href="/innovation/problems"
            className="inline-block px-6 py-2 bg-[#fd9923] text-white rounded font-medium hover:bg-[#e68a00] transition-colors text-sm"
          >
            Browse Open Problems
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Application List (Left Panel) */}
          <div className="xl:col-span-1 space-y-3">
            <h3 className="font-headline text-lg font-bold text-[#002155] mb-4">Applications ({applications.length})</h3>
            {applications.map((app) => {
              const badgeInfo = getStatusBadge(app.status);
              const isSelected = selectedApp?.id === app.id;

              return (
                <button
                  key={app.id}
                  onClick={() => setSelectedApp(app)}
                  className={`w-full text-left px-4 py-3 border rounded transition-all ${
                    isSelected
                      ? 'border-[#fd9923] bg-[#f9f8f4]'
                      : 'border-[#c4c6d3] bg-white hover:border-[#fd9923]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[#002155] text-sm line-clamp-2">{app.problem.title}</p>
                      <p className="text-xs text-[#747782] mt-1">
                        {new Date(app.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${badgeInfo.color}`}>
                      {badgeInfo.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Application Detail (Right Panel) */}
          <div className="xl:col-span-2">
            {selectedApp ? (
              <div className="border border-[#c4c6d3] bg-white rounded p-6">
                {/* Header */}
                <div className="mb-6">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <h2 className="font-headline text-2xl font-bold text-[#002155]">{selectedApp.problem.title}</h2>
                    {(() => {
                      const badgeInfo = getStatusBadge(selectedApp.status);
                      return <span className={`inline-block px-3 py-1 rounded font-bold text-sm ${badgeInfo.color}`}>{badgeInfo.label}</span>;
                    })()}
                  </div>
                  <p className="text-xs text-[#747782]">
                    Applied on {new Date(selectedApp.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="space-y-6 border-t border-[#c4c6d3] pt-6">
                  {/* Answers Section */}
                  <div>
                    <h3 className="font-bold text-sm text-[#002155] mb-4">Your Answers</h3>
                    <div className="space-y-4">
                      {selectedApp.answers.map((answer, idx) => (
                        <div key={idx} className="bg-[#f9f8f4] border border-[#e3e2df] p-4 rounded">
                          <p className="text-sm font-medium text-[#002155]">
                            {idx + 1}. {answer.question.questionText}
                          </p>
                          <p className="text-sm text-[#434651] mt-2 whitespace-pre-wrap">{answer.answerText}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Feedback Section */}
                  {selectedApp.feedback && (
                    <div className="bg-blue-50 border border-blue-200 p-4 rounded">
                      <p className="text-sm font-bold text-blue-900 mb-2">💬 Faculty Feedback</p>
                      <p className="text-sm text-blue-800 whitespace-pre-wrap">{selectedApp.feedback}</p>
                    </div>
                  )}

                  {selectedApp.status === 'SUBMITTED' && !selectedApp.feedback && (
                    <div className="bg-yellow-50 border border-yellow-200 p-4 rounded">
                      <p className="text-sm text-yellow-800">
                        ⏳ Your application is under review. Faculty will provide feedback soon.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-[#c4c6d3] bg-white p-8 rounded text-center">
                <p className="text-[#434651]">Select an application to view details</p>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
