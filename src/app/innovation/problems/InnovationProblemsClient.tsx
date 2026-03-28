"use client";

import { useEffect, useMemo, useState } from 'react';

type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T;
  errors?: string[];
};

type ProblemRow = {
  id: number;
  title: string;
  description: string;
  tags: string | null;
  isIndustryProblem: boolean;
  industryName: string | null;
  supportDocumentUrl: string | null;
  mode: 'OPEN' | 'CLOSED';
  status: 'OPENED' | 'CLOSED' | 'ARCHIVED';
  createdById: number;
  createdBy: { id: number; name: string; email: string };
  _count: { claims: number; openSubmissions: number };
};

type UidLookupRow = {
  uid: string;
  found: boolean;
  eligible: boolean;
  alreadyParticipated: boolean;
  reason: string;
  name: string | null;
  email: string | null;
  role: string | null;
  status: string | null;
  isVerified: boolean | null;
};

type OpenRegistrationFormState = {
  teamName: string;
  teamSize: number;
  teamLeadUid: string;
  memberCsv: string;
  technicalDocument: File | null;
  pptFile: File | null;
  uidLookupRows: UidLookupRow[];
  uidLookupMessage: string;
  verifiedSnapshot: string;
  lookupLoading: boolean;
  submitLoading: boolean;
};

type InnovationProblemsClientProps = {
  role: 'STUDENT' | 'FACULTY' | 'ADMIN';
  userId: number;
};

const parseUidTokens = (value: string): string[] =>
  value
    .split(',')
    .map((v) => v.trim().toUpperCase())
    .filter((v) => v.length > 0);

const emptyRegistrationForm = (): OpenRegistrationFormState => ({
  teamName: '',
  teamSize: 1,
  teamLeadUid: '',
  memberCsv: '',
  technicalDocument: null,
  pptFile: null,
  uidLookupRows: [],
  uidLookupMessage: '',
  verifiedSnapshot: '',
  lookupLoading: false,
  submitLoading: false,
});

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options?.headers ?? {}),
    },
  });

  const payload = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok || !payload.success) throw new Error(payload.message || 'Request failed');
  return payload.data;
}

export default function InnovationProblemsClient({ role, userId }: InnovationProblemsClientProps) {
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [problems, setProblems] = useState<ProblemRow[]>([]);

  const [tagFilter, setTagFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newTags, setNewTags] = useState('');
  const [newIsIndustryProblem, setNewIsIndustryProblem] = useState(false);
  const [newIndustryName, setNewIndustryName] = useState('');
  const [newSupportDocument, setNewSupportDocument] = useState<File | null>(null);

  const [registrationForms, setRegistrationForms] = useState<Record<number, OpenRegistrationFormState>>({});

  const loadProblems = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const params = new URLSearchParams();
      if (tagFilter.trim()) params.set('tag', tagFilter.trim());
      if (statusFilter.trim()) params.set('status', statusFilter.trim());

      const query = params.toString();
      const data = await fetchJson<ProblemRow[]>(`/api/innovation/problems${query ? `?${query}` : ''}`);
      setProblems(data);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load problems');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProblems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ownProblems = useMemo(() => problems.filter((p) => p.createdById === userId), [problems, userId]);

  const runAction = async (action: () => Promise<void>, success: string) => {
    setErrorMessage('');
    setStatusMessage('');
    setLoading(true);
    try {
      await action();
      setStatusMessage(success);
      await loadProblems();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  const submitCreateProblem = async (event: React.FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      const formData = new FormData();
      formData.set('title', newTitle);
      formData.set('description', newDescription);
      formData.set('tags', newTags);
      formData.set('mode', 'OPEN');
      formData.set('isIndustryProblem', String(newIsIndustryProblem));
      if (newIsIndustryProblem) formData.set('industryName', newIndustryName);
      if (newSupportDocument) formData.set('supportDocument', newSupportDocument);

      await fetchJson('/api/innovation/problems', {
        method: 'POST',
        body: formData,
      });
      setNewTitle('');
      setNewDescription('');
      setNewTags('');
      setNewIsIndustryProblem(false);
      setNewIndustryName('');
      setNewSupportDocument(null);
    }, 'Problem created successfully.');
  };

  const getRegistrationForm = (problemId: number): OpenRegistrationFormState => registrationForms[problemId] || emptyRegistrationForm();

  const updateRegistrationForm = (
    problemId: number,
    updater: (prev: OpenRegistrationFormState) => OpenRegistrationFormState
  ) => {
    setRegistrationForms((prev) => ({
      ...prev,
      [problemId]: updater(prev[problemId] || emptyRegistrationForm()),
    }));
  };

  const validateRegistrationInputs = (form: OpenRegistrationFormState) => {
    const cleanedLeadUid = form.teamLeadUid.trim().toUpperCase();
    const memberTokens = parseUidTokens(form.memberCsv);
    const cleanedMemberUids = Array.from(new Set(memberTokens));

    if (!form.teamName.trim()) {
      return { error: 'Team name is required.', cleanedLeadUid, cleanedMemberUids, snapshot: '' };
    }

    if (!cleanedLeadUid) {
      return { error: 'Team lead UID is required.', cleanedLeadUid, cleanedMemberUids, snapshot: '' };
    }

    if (form.teamSize !== cleanedMemberUids.length + 1) {
      return {
        error: 'Team size must match team lead plus number of member UIDs.',
        cleanedLeadUid,
        cleanedMemberUids,
        snapshot: '',
      };
    }

    if (memberTokens.length !== cleanedMemberUids.length) {
      return { error: 'Member UIDs must be unique.', cleanedLeadUid, cleanedMemberUids, snapshot: '' };
    }

    if (cleanedMemberUids.includes(cleanedLeadUid)) {
      return {
        error: 'Team lead UID cannot be repeated in member UIDs.',
        cleanedLeadUid,
        cleanedMemberUids,
        snapshot: '',
      };
    }

    const snapshot = JSON.stringify([cleanedLeadUid, ...cleanedMemberUids]);
    return { error: null, cleanedLeadUid, cleanedMemberUids, snapshot };
  };

  const handleFetchUidDetails = async (problemId: number) => {
    const form = getRegistrationForm(problemId);
    const { error, cleanedLeadUid, cleanedMemberUids, snapshot } = validateRegistrationInputs(form);
    if (error) {
      setErrorMessage(error);
      return;
    }

    setErrorMessage('');

    updateRegistrationForm(problemId, (prev) => ({
      ...prev,
      lookupLoading: true,
      uidLookupMessage: '',
    }));

    try {
      const requestedUids = [cleanedLeadUid, ...cleanedMemberUids];
      const data = await fetchJson<UidLookupRow[]>(
        `/api/innovation/users/lookup?registrationType=open&problemId=${problemId}&uids=${encodeURIComponent(
          JSON.stringify(requestedUids)
        )}`,
        {
          method: 'GET',
        }
      );

      const hasIneligible = data.some((row) => !row.eligible);
      updateRegistrationForm(problemId, (prev) => ({
        ...prev,
        uidLookupRows: data,
        verifiedSnapshot: hasIneligible ? '' : snapshot,
        uidLookupMessage: hasIneligible
          ? 'Some UIDs are non-eligible. Check detailed reason and update before submitting.'
          : 'UID details fetched and verified. You can now submit registration.',
      }));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to fetch UID details');
      updateRegistrationForm(problemId, (prev) => ({
        ...prev,
        uidLookupRows: [],
        verifiedSnapshot: '',
      }));
    } finally {
      updateRegistrationForm(problemId, (prev) => ({ ...prev, lookupLoading: false }));
    }
  };

  const submitOpenRegistration = async (problemId: number, event: React.FormEvent) => {
    event.preventDefault();
    const form = getRegistrationForm(problemId);

    const { error, cleanedLeadUid, cleanedMemberUids, snapshot } = validateRegistrationInputs(form);
    if (error) {
      setErrorMessage(error);
      return;
    }

    if (form.verifiedSnapshot !== snapshot) {
      setErrorMessage('Please fetch and verify UID details before submitting registration.');
      return;
    }

    if (form.uidLookupRows.some((row) => !row.eligible)) {
      setErrorMessage('One or more UIDs are non-eligible. Please update and verify again.');
      return;
    }

    if (!form.technicalDocument || !form.pptFile) {
      setErrorMessage('Technical document and PPT are both compulsory for open statement registration.');
      return;
    }

    updateRegistrationForm(problemId, (prev) => ({ ...prev, submitLoading: true }));
    setErrorMessage('');
    setStatusMessage('');

    try {
      const formData = new FormData();
      formData.set('problemId', String(problemId));
      formData.set('teamName', form.teamName.trim());
      formData.set('teamSize', String(form.teamSize));
      formData.set('teamLeadUid', cleanedLeadUid);
      formData.set('memberUids', JSON.stringify(cleanedMemberUids));
      formData.set('technicalDocument', form.technicalDocument);
      formData.set('pptFile', form.pptFile);

      await fetchJson('/api/innovation/open-submissions', {
        method: 'POST',
        body: formData,
      });

      setStatusMessage('Open problem statement registration submitted successfully.');
      setRegistrationForms((prev) => ({
        ...prev,
        [problemId]: emptyRegistrationForm(),
      }));
      await loadProblems();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      updateRegistrationForm(problemId, (prev) => ({ ...prev, submitLoading: false }));
    }
  };

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-[#002155] leading-none">
          Innovation Problems
        </h1>
        <p className="mt-2 text-[#434651] max-w-3xl font-body">
          Browse problem statements, submit claims, and track participation across continuous innovation tracks.
        </p>
      </header>

      {statusMessage ? <p className="mb-4 border border-green-300 bg-green-50 text-green-800 px-4 py-3 text-sm">{statusMessage}</p> : null}
      {errorMessage ? <p className="mb-4 border border-red-300 bg-red-50 text-red-700 px-4 py-3 text-sm">{errorMessage}</p> : null}

      <section className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <input
          className="w-full border border-[#747782] p-3 text-sm"
          placeholder="Filter by tag"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
        />
        <select className="w-full border border-[#747782] p-3 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="OPENED">OPENED</option>
          <option value="CLOSED">CLOSED</option>
          <option value="ARCHIVED">ARCHIVED</option>
        </select>
        <button
          onClick={() => void loadProblems()}
          className="bg-[#002155] text-white px-4 py-3 text-xs font-bold uppercase tracking-wider"
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Apply Filters'}
        </button>
      </section>

      {(role === 'FACULTY' || role === 'ADMIN') && (
        <section className="mb-10 border border-[#c4c6d3] bg-white p-5">
          <h2 className="font-headline text-2xl text-[#002155] mb-4">Create Problem</h2>
          <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={submitCreateProblem}>
            <input className="border border-[#747782] p-3 text-sm" placeholder="Title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required />
            <div className="border border-[#e3e2df] bg-[#faf9f5] p-3 text-xs text-[#434651] flex items-center">Creates OPEN innovation problem</div>
            <select
              className="border border-[#747782] p-3 text-sm"
              value={newIsIndustryProblem ? 'industry' : 'normal'}
              onChange={(e) => {
                const isIndustry = e.target.value === 'industry';
                setNewIsIndustryProblem(isIndustry);
                if (!isIndustry) setNewIndustryName('');
              }}
            >
              <option value="normal">Problem Type: Normal</option>
              <option value="industry">Problem Type: Industry</option>
            </select>
            {newIsIndustryProblem ? (
              <input
                className="border border-[#747782] p-3 text-sm"
                placeholder="Industry name"
                value={newIndustryName}
                onChange={(e) => setNewIndustryName(e.target.value)}
                required
              />
            ) : (
              <div className="border border-[#e3e2df] bg-[#faf9f5] p-3 text-xs text-[#434651] flex items-center">
                Normal problem selected
              </div>
            )}
            <input className="border border-[#747782] p-3 text-sm md:col-span-2" placeholder="Tags (comma-separated)" value={newTags} onChange={(e) => setNewTags(e.target.value)} />
            <textarea
              className="border border-[#747782] p-3 text-sm min-h-[120px] md:col-span-2"
              placeholder="Description"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              required
            />
            <div className="md:col-span-2 border border-dashed border-[#c4c6d3] bg-[#faf9f5] p-3">
              <p className="text-xs text-[#434651] mb-2">Optional support document (PDF only) for this open problem statement.</p>
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => setNewSupportDocument(e.target.files?.[0] ?? null)}
              />
            </div>
            <button type="submit" className="bg-[#002155] text-white px-4 py-3 text-xs font-bold uppercase tracking-wider md:w-fit" disabled={loading}>
              Create Problem
            </button>
          </form>

          <div className="mt-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#434651] mb-3">My Problems</h3>
            {ownProblems.length === 0 ? (
              <p className="text-sm text-[#434651]">No authored problems yet.</p>
            ) : (
              <div className="space-y-3">
                {ownProblems.map((problem) => (
                  <article key={problem.id} className="border border-[#e3e2df] p-3 bg-[#faf9f5]">
                    <p className="text-sm font-bold text-[#002155]">{problem.title}</p>
                    <p className="text-xs text-[#434651] mt-1">{problem.mode} • {problem.status} • Registrations {problem._count.openSubmissions}</p>
                    <p className="text-xs text-[#434651] mt-1">
                      Type: {problem.isIndustryProblem ? `Industry${problem.industryName ? ` (${problem.industryName})` : ''}` : 'Normal'}
                    </p>
                    {problem.supportDocumentUrl ? (
                      <a href={problem.supportDocumentUrl} target="_blank" rel="noreferrer" className="inline-flex mt-2 text-xs font-bold uppercase tracking-wider text-[#8c4f00] underline">
                        Open Support PDF
                      </a>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-headline text-2xl text-[#002155] mb-4">Problem Board</h2>
        {problems.length === 0 ? (
          <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">No problems found for current filters.</p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {problems.map((problem) => {
              const form = getRegistrationForm(problem.id);
              const canRegister = role === 'STUDENT' && problem.status === 'OPENED' && problem.mode === 'OPEN';
              return (
                <article key={problem.id} className="border border-[#c4c6d3] bg-white p-5">
                  <p className="text-xs uppercase tracking-widest text-[#8c4f00]">{problem.mode}</p>
                  <h3 className="mt-1 text-lg font-bold text-[#002155]">{problem.title}</h3>
                  <p className="mt-1 text-xs text-[#434651]">
                    Type: {problem.isIndustryProblem ? `Industry${problem.industryName ? ` (${problem.industryName})` : ''}` : 'Normal'}
                  </p>
                  <p className="mt-2 text-sm text-[#434651] line-clamp-4">{problem.description}</p>
                  <p className="mt-2 text-xs text-[#434651]">Status: {problem.status}</p>
                  <p className="mt-1 text-xs text-[#434651]">Tags: {problem.tags || 'None'}</p>
                  <p className="mt-1 text-xs text-[#434651]">Registrations: {problem._count.openSubmissions}</p>
                  {problem.supportDocumentUrl ? (
                    <a
                      href={problem.supportDocumentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex mt-2 text-xs font-bold uppercase tracking-wider text-[#8c4f00] underline"
                    >
                      Open Problem Support PDF
                    </a>
                  ) : null}

                  {canRegister ? (
                    <form className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={(event) => void submitOpenRegistration(problem.id, event)}>
                      <input
                        className="border border-[#747782] p-2 text-xs"
                        placeholder="Team name"
                        value={form.teamName}
                        onChange={(event) =>
                          updateRegistrationForm(problem.id, (prev) => ({ ...prev, teamName: event.target.value, verifiedSnapshot: '', uidLookupRows: [], uidLookupMessage: '' }))
                        }
                        required
                      />
                      <input
                        type="number"
                        min={1}
                        max={10}
                        className="border border-[#747782] p-2 text-xs"
                        placeholder="Total team size (including lead)"
                        value={form.teamSize}
                        onChange={(event) =>
                          updateRegistrationForm(problem.id, (prev) => ({
                            ...prev,
                            teamSize: Math.max(1, Number(event.target.value) || 1),
                            verifiedSnapshot: '',
                            uidLookupRows: [],
                            uidLookupMessage: '',
                          }))
                        }
                        required
                      />
                      <input
                        className="border border-[#747782] p-2 text-xs md:col-span-2"
                        placeholder="Team lead UID (e.g. 24-COMPD13-28)"
                        value={form.teamLeadUid}
                        onChange={(event) =>
                          updateRegistrationForm(problem.id, (prev) => ({
                            ...prev,
                            teamLeadUid: event.target.value,
                            verifiedSnapshot: '',
                            uidLookupRows: [],
                            uidLookupMessage: '',
                          }))
                        }
                        required
                      />
                      <input
                        className="border border-[#747782] p-2 text-xs md:col-span-2"
                        placeholder="Member UIDs comma-separated (e.g. 24-COMPD13-28)"
                        value={form.memberCsv}
                        onChange={(event) =>
                          updateRegistrationForm(problem.id, (prev) => ({
                            ...prev,
                            memberCsv: event.target.value,
                            verifiedSnapshot: '',
                            uidLookupRows: [],
                            uidLookupMessage: '',
                          }))
                        }
                      />
                      <p className="md:col-span-2 text-[11px] text-[#434651]">UID format: XX-BRANCHYY-ZZ (example: 24-COMPD13-28)</p>
                      <button
                        type="button"
                        onClick={() => void handleFetchUidDetails(problem.id)}
                        className="border border-[#002155] text-[#002155] px-3 py-2 text-xs font-bold uppercase tracking-wider md:w-fit"
                        disabled={form.lookupLoading || form.submitLoading || loading}
                      >
                        {form.lookupLoading ? 'Fetching UID Details...' : 'Fetch UID Details'}
                      </button>
                      {form.uidLookupMessage ? (
                        <p className={`md:col-span-2 text-xs ${form.verifiedSnapshot ? 'text-green-700' : 'text-[#8c4f00]'}`}>{form.uidLookupMessage}</p>
                      ) : null}
                      {form.uidLookupRows.length > 0 ? (
                        <div className="md:col-span-2 border border-[#e3e2df] bg-[#faf9f5] p-3">
                          <p className="text-xs font-bold uppercase tracking-wider text-[#002155]">UID Verification Results</p>
                          <ul className="mt-2 space-y-2">
                            {form.uidLookupRows.map((row) => (
                              <li key={row.uid} className="text-xs text-[#434651]">
                                <span className="font-bold text-[#002155]">{row.uid}</span>: {row.found ? `${row.name || 'Unknown'} (${row.email || 'No email'})` : 'Not found'}
                                {row.found ? ` | ${row.role} | ${row.status} | ${row.isVerified ? 'Verified' : 'Not verified'}` : ''}
                                {' | '}
                                <span className={row.eligible ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>
                                  {row.eligible ? 'Eligible' : 'Non-eligible'}
                                </span>
                                {` | ${row.reason}`}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <div className="md:col-span-2 border border-dashed border-[#c4c6d3] bg-[#faf9f5] p-3">
                        <p className="text-xs text-[#434651] mb-2">Upload Technical Document (PDF/DOC/DOCX) - Compulsory</p>
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          onChange={(event) =>
                            updateRegistrationForm(problem.id, (prev) => ({
                              ...prev,
                              technicalDocument: event.target.files?.[0] ?? null,
                            }))
                          }
                          required
                        />
                      </div>
                      <div className="md:col-span-2 border border-dashed border-[#c4c6d3] bg-[#faf9f5] p-3">
                        <p className="text-xs text-[#434651] mb-2">Upload PPT (PPT/PPTX) - Compulsory</p>
                        <input
                          type="file"
                          accept=".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                          onChange={(event) =>
                            updateRegistrationForm(problem.id, (prev) => ({
                              ...prev,
                              pptFile: event.target.files?.[0] ?? null,
                            }))
                          }
                          required
                        />
                      </div>
                      <button type="submit" className="bg-[#002155] text-white px-3 py-2 text-xs font-bold uppercase tracking-wider md:w-fit" disabled={loading}>
                        {form.submitLoading ? 'Submitting...' : 'Register for Open Statement'}
                      </button>
                    </form>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
