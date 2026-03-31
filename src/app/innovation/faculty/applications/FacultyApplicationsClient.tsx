'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface StudentProfile {
  skills: string | null;
  experience: string | null;
  interests: string | null;
  resumeUrl: string | null;
  resumeFileName: string | null;
}

interface Question {
  id: number;
  questionText: string;
}

interface Answer {
  question: Question;
  answerText: string;
}

interface ApplicationData {
  id: number;
  status: 'SUBMITTED' | 'SELECTED' | 'REJECTED';
  createdAt: string;
  feedback: string | null;
  student?: {
    id: number;
    name: string;
    email: string;
  };
  user?: {
    id: number;
    name: string;
    email: string;
  };
  studentProfile?: StudentProfile;
  profile?: StudentProfile;
  problem: {
    id: number;
    title: string;
  };
  answers: Answer[];
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

export default function FacultyApplicationsClient() {
  const [applications, setApplications] = useState<ApplicationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<ApplicationData | null>(null);
  const [reviewingStatus, setReviewingStatus] = useState<string | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'SUBMITTED' | 'SELECTED' | 'REJECTED'>('ALL');

  const getApplicantName = (app: ApplicationData) => app.student?.name || app.user?.name || 'Unknown student';
  const getApplicantEmail = (app: ApplicationData) => app.student?.email || app.user?.email || 'No email';
  const getApplicantProfile = (app: ApplicationData): StudentProfile =>
    app.studentProfile || app.profile || {
      skills: null,
      experience: null,
      interests: null,
      resumeUrl: null,
      resumeFileName: null,
    };

  useEffect(() => {
    const fetchApplications = async () => {
      try {
        const res = await fetch('/api/innovation/faculty/applications');
        if (!res.ok) {
          throw new Error('Failed to load applications');
        }
        const data = await res.json();
        setApplications(data.data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading applications');
      } finally {
        setLoading(false);
      }
    };

    fetchApplications();
  }, []);

  const handleStatusChange = async (applicationId: number, newStatus: 'SELECTED' | 'REJECTED') => {
    try {
      setReviewingStatus(newStatus);
      const res = await fetch(`/api/innovation/faculty/applications/${applicationId}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          feedback: reviewFeedback.trim(),
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to update application status');
      }

      // Update local state
      setApplications((prev) =>
        prev.map((app) =>
          app.id === applicationId
            ? { ...app, status: newStatus, feedback: reviewFeedback.trim() }
            : app
        )
      );

      setSelectedApp((prev) =>
        prev && prev.id === applicationId
          ? { ...prev, status: newStatus, feedback: reviewFeedback.trim() }
          : prev
      );

      // Clear form
      setReviewFeedback('');
      setReviewingStatus(null);
      alert('Application status updated successfully');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error updating application');
      setReviewingStatus(null);
    }
  };

  const filteredApplications = applications.filter((app) => {
    if (filterStatus === 'ALL') return true;
    return app.status === filterStatus;
  });
  const selectedProfile = selectedApp ? getApplicantProfile(selectedApp) : null;

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
        <div className="text-center text-[#434651]">Loading applications...</div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
      {/* Header */}
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-[#002155] leading-none">
          Application Reviews
        </h1>
        <p className="mt-2 text-[#434651] max-w-3xl font-body text-sm">
          Review and manage student applications for open problems
        </p>
      </header>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-800 text-sm rounded">
          <p className="font-medium">{error}</p>
        </div>
      )}

      {/* Empty State */}
      {filteredApplications.length === 0 ? (
        <div className="border border-dashed border-[#c4c6d3] bg-white p-8 rounded text-center">
          <p className="text-[#434651] font-medium">
            {applications.length === 0
              ? 'No applications yet. Applications will appear here when students apply for your problems.'
              : 'No applications match the selected filter.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Applications List (Left Panel) */}
          <div className="xl:col-span-1 space-y-3">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-headline text-lg font-bold text-[#002155]">Applications ({filteredApplications.length})</h3>
            </div>

            {/* Filter */}
            <div className="mb-4">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm focus:outline-none focus:border-[#fd9923]"
              >
                <option value="ALL">All Applications</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="SELECTED">Selected</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>

            {/* List */}
            {filteredApplications.map((app) => {
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
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[#002155] text-sm">{getApplicantName(app)}</p>
                      <p className="text-xs text-[#747782] mt-1 line-clamp-1">{app.problem.title}</p>
                    </div>
                  </div>
                  <div>
                    <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${badgeInfo.color}`}>
                      {badgeInfo.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Application Details (Right Panel) */}
          <div className="xl:col-span-2">
            {selectedApp ? (
              <div className="border border-[#c4c6d3] bg-white rounded p-6">
                {/* Header */}
                <div className="mb-6 pb-6 border-b border-[#c4c6d3]">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <h2 className="font-headline text-xl font-bold text-[#002155]">{getApplicantName(selectedApp)}</h2>
                      <p className="text-xs text-[#747782] mt-1">{getApplicantEmail(selectedApp)}</p>
                      <p className="text-sm text-[#434651] mt-2">
                        <span className="font-medium">Problem:</span> {selectedApp.problem.title}
                      </p>
                      <p className="text-xs text-[#747782] mt-1">
                        Applied: {new Date(selectedApp.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    {(() => {
                      const badgeInfo = getStatusBadge(selectedApp.status);
                      return <span className={`inline-block px-3 py-1 rounded font-bold text-sm ${badgeInfo.color}`}>{badgeInfo.label}</span>;
                    })()}
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Student Profile Section */}
                  <div>
                    <h3 className="font-bold text-sm text-[#002155] mb-4">Student Profile</h3>
                    <div className="space-y-3 bg-[#f9f8f4] border border-[#e3e2df] p-4 rounded">
                      {selectedProfile?.skills && (
                        <div>
                          <p className="text-xs font-medium text-[#002155]">Skills</p>
                          <p className="text-sm text-[#434651] mt-1">{selectedProfile.skills}</p>
                        </div>
                      )}
                      {selectedProfile?.experience && (
                        <div>
                          <p className="text-xs font-medium text-[#002155]">Experience</p>
                          <p className="text-sm text-[#434651] mt-1 whitespace-pre-wrap">{selectedProfile.experience}</p>
                        </div>
                      )}
                      {selectedProfile?.interests && (
                        <div>
                          <p className="text-xs font-medium text-[#002155]">Interests</p>
                          <p className="text-sm text-[#434651] mt-1">{selectedProfile.interests}</p>
                        </div>
                      )}
                      {selectedProfile?.resumeFileName && (
                        <div>
                          <p className="text-xs font-medium text-[#002155]">Resume</p>
                          {selectedProfile.resumeUrl ? (
                            <a
                              href={selectedProfile.resumeUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-[#fd9923] font-bold underline hover:text-[#e68a00] mt-1 inline-block"
                            >
                              View: {selectedProfile.resumeFileName}
                            </a>
                          ) : (
                            <p className="text-xs text-[#747782] mt-1">{selectedProfile.resumeFileName}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Answers Section */}
                  <div>
                    <h3 className="font-bold text-sm text-[#002155] mb-4">Application Answers</h3>
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

                  {/* Review Section */}
                  {selectedApp.status === 'SUBMITTED' && (
                    <div className="border-t border-[#c4c6d3] pt-6">
                      <h3 className="font-bold text-sm text-[#002155] mb-4">Make Decision</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-medium text-[#002155] mb-2">Feedback (Optional)</label>
                          <textarea
                            value={reviewFeedback}
                            onChange={(e) => setReviewFeedback(e.target.value)}
                            placeholder="Add feedback for the student..."
                            className="w-full px-3 py-2 border border-[#c4c6d3] rounded text-sm focus:outline-none focus:border-[#fd9923]"
                            rows={3}
                          />
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleStatusChange(selectedApp.id, 'SELECTED')}
                            disabled={reviewingStatus === 'SELECTED'}
                            className="flex-1 px-4 py-2 bg-green-600 text-white rounded font-medium hover:bg-green-700 disabled:opacity-50 transition-colors text-sm"
                          >
                            {reviewingStatus === 'SELECTED' ? 'Updating...' : '✓ Select'}
                          </button>
                          <button
                            onClick={() => handleStatusChange(selectedApp.id, 'REJECTED')}
                            disabled={reviewingStatus === 'REJECTED'}
                            className="flex-1 px-4 py-2 bg-red-600 text-white rounded font-medium hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
                          >
                            {reviewingStatus === 'REJECTED' ? 'Updating...' : '✕ Reject'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Existing Feedback */}
                  {selectedApp.feedback && (
                    <div className="bg-blue-50 border border-blue-200 p-4 rounded">
                      <p className="text-sm font-bold text-blue-900 mb-2">💬 Your Feedback</p>
                      <p className="text-sm text-blue-800 whitespace-pre-wrap">{selectedApp.feedback}</p>
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
