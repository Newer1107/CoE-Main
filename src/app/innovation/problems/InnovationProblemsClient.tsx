"use client";

import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';

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
  role: 'STUDENT' | 'FACULTY' | 'ADMIN' | null;
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

export default function InnovationProblemsClient({ role }: InnovationProblemsClientProps) {
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [problems, setProblems] = useState<ProblemRow[]>([]);

  const [tagFilter, setTagFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modal state
  const [modalProblem, setModalProblem] = useState<ProblemRow | null>(null);
  const [modalForm, setModalForm] = useState<OpenRegistrationFormState>(emptyRegistrationForm());
  const [modalError, setModalError] = useState('');
  const [modalStatus, setModalStatus] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);

  const resetModalState = () => {
    setModalProblem(null);
    setModalForm(emptyRegistrationForm());
    setModalError('');
    setModalStatus('');
  };

  const openModal = (problem: ProblemRow) => {
    setModalProblem(problem);
    setModalForm(emptyRegistrationForm());
    setModalError('');
    setModalStatus('');
    dialogRef.current?.showModal();
  };

  const closeModal = () => {
    if (dialogRef.current?.open) {
      dialogRef.current.close();
      return;
    }
    resetModalState();
  };

  // Close modal on backdrop click
  const handleDialogClick = (e: MouseEvent<HTMLDialogElement>) => {
    const rect = dialogRef.current?.getBoundingClientRect();
    if (rect && (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)) {
      closeModal();
    }
  };

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
      return { error: 'Team size must match team lead plus number of member UIDs.', cleanedLeadUid, cleanedMemberUids, snapshot: '' };
    }
    if (memberTokens.length !== cleanedMemberUids.length) {
      return { error: 'Member UIDs must be unique.', cleanedLeadUid, cleanedMemberUids, snapshot: '' };
    }
    if (cleanedMemberUids.includes(cleanedLeadUid)) {
      return { error: 'Team lead UID cannot be repeated in member UIDs.', cleanedLeadUid, cleanedMemberUids, snapshot: '' };
    }

    const snapshot = JSON.stringify([cleanedLeadUid, ...cleanedMemberUids]);
    return { error: null, cleanedLeadUid, cleanedMemberUids, snapshot };
  };

  const handleFetchUidDetails = async () => {
    if (!modalProblem) return;
    const { error, cleanedLeadUid, cleanedMemberUids, snapshot } = validateRegistrationInputs(modalForm);
    if (error) { setModalError(error); return; }
    setModalError('');
    setModalForm((prev) => ({ ...prev, lookupLoading: true, uidLookupMessage: '' }));

    try {
      const requestedUids = [cleanedLeadUid, ...cleanedMemberUids];
      const data = await fetchJson<UidLookupRow[]>(
        `/api/innovation/users/lookup?registrationType=open&problemId=${modalProblem.id}&uids=${encodeURIComponent(JSON.stringify(requestedUids))}`,
        { method: 'GET' }
      );
      const hasIneligible = data.some((row) => !row.eligible);
      setModalForm((prev) => ({
        ...prev,
        uidLookupRows: data,
        verifiedSnapshot: hasIneligible ? '' : snapshot,
        uidLookupMessage: hasIneligible
          ? 'Some UIDs are non-eligible. Check detailed reason and update before submitting.'
          : 'UID details fetched and verified. You can now submit registration.',
      }));
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to fetch UID details');
      setModalForm((prev) => ({ ...prev, uidLookupRows: [], verifiedSnapshot: '' }));
    } finally {
      setModalForm((prev) => ({ ...prev, lookupLoading: false }));
    }
  };

  const submitOpenRegistration = async (event: FormEvent) => {
    event.preventDefault();
    if (!modalProblem) return;

    const { error, cleanedLeadUid, cleanedMemberUids, snapshot } = validateRegistrationInputs(modalForm);
    if (error) { setModalError(error); return; }

    if (modalForm.verifiedSnapshot !== snapshot) {
      setModalError('Please fetch and verify UID details before submitting registration.');
      return;
    }
    if (modalForm.uidLookupRows.some((row) => !row.eligible)) {
      setModalError('One or more UIDs are non-eligible. Please update and verify again.');
      return;
    }
    if (!modalForm.technicalDocument || !modalForm.pptFile) {
      setModalError('Technical document and PPT are both compulsory for open statement registration.');
      return;
    }

    setModalForm((prev) => ({ ...prev, submitLoading: true }));
    setModalError('');

    try {
      const formData = new FormData();
      formData.set('problemId', String(modalProblem.id));
      formData.set('teamName', modalForm.teamName.trim());
      formData.set('teamSize', String(modalForm.teamSize));
      formData.set('teamLeadUid', cleanedLeadUid);
      formData.set('memberUids', JSON.stringify(cleanedMemberUids));
      formData.set('technicalDocument', modalForm.technicalDocument);
      formData.set('pptFile', modalForm.pptFile);

      await fetchJson('/api/innovation/open-submissions', { method: 'POST', body: formData });

      setModalStatus('Registration submitted successfully!');
      setStatusMessage('Open problem statement registration submitted successfully.');
      setTimeout(() => closeModal(), 1800);
      await loadProblems();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setModalForm((prev) => ({ ...prev, submitLoading: false }));
    }
  };

  return (
    <main className="max-w-7xl mx-auto mt-10 px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
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
        <select
          className="w-full border border-[#747782] p-3 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
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

      {/* Problem Cards */}
      <section>
        <h2 className="font-headline text-2xl text-[#002155] mb-4">Problem Board</h2>
        {problems.length === 0 ? (
          <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">
            No problems found for current filters.
          </p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {problems.map((problem) => {
              const canRegister = role === 'STUDENT' && problem.status === 'OPENED' && problem.mode === 'OPEN';
              return (
                <article key={problem.id} className="border border-[#c4c6d3] bg-white p-5">
                  <p className="text-xs uppercase tracking-widest text-[#8c4f00]">{problem.mode}</p>
                  <h3 className="mt-1 text-lg font-bold text-[#002155]">{problem.title}</h3>
                  <p className="mt-1 text-xs text-[#434651]">
                    Type:{' '}
                    {problem.isIndustryProblem
                      ? `Industry${problem.industryName ? ` (${problem.industryName})` : ''}`
                      : 'Normal'}
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
                    <div className="mt-4">
                      <button
                        onClick={() => openModal(problem)}
                        className="bg-[#002155] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-[#003380] transition-colors"
                      >
                        Register for Open Statement
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Registration Modal */}
      <dialog
        ref={dialogRef}
        onClick={handleDialogClick}
        onClose={resetModalState}
        onCancel={(event) => {
          event.preventDefault();
          closeModal();
        }}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-[#c4c6d3] bg-white p-0 shadow-2xl backdrop:bg-black/50 open:flex open:flex-col"
        style={{ margin: 'auto' }}
      >
        {modalProblem && (
          <>
            {/* Modal Header */}
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[#c4c6d3] bg-[#002155] px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-[#f5c842]">{modalProblem.mode} Statement</p>
                <h2 className="mt-0.5 text-lg font-bold text-white leading-snug">{modalProblem.title}</h2>
              </div>
              <button
                onClick={closeModal}
                aria-label="Close modal"
                className="ml-4 mt-0.5 flex-shrink-0 text-white/70 hover:text-white text-2xl leading-none transition-colors"
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 flex-1">
              {modalStatus ? (
                <p className="mb-4 border border-green-300 bg-green-50 text-green-800 px-4 py-3 text-sm">{modalStatus}</p>
              ) : null}
              {modalError ? (
                <p className="mb-4 border border-red-300 bg-red-50 text-red-700 px-4 py-3 text-sm">{modalError}</p>
              ) : null}

              <form className="grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={(e) => void submitOpenRegistration(e)}>
                <input
                  className="border border-[#747782] p-2 text-xs"
                  placeholder="Team name"
                  value={modalForm.teamName}
                  onChange={(e) =>
                    setModalForm((prev) => ({
                      ...prev,
                      teamName: e.target.value,
                      verifiedSnapshot: '',
                      uidLookupRows: [],
                      uidLookupMessage: '',
                    }))
                  }
                  required
                />
                <input
                  type="number"
                  min={1}
                  max={10}
                  className="border border-[#747782] p-2 text-xs"
                  placeholder="Total team size (including lead)"
                  value={modalForm.teamSize}
                  onChange={(e) =>
                    setModalForm((prev) => ({
                      ...prev,
                      teamSize: Math.max(1, Number(e.target.value) || 1),
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
                  value={modalForm.teamLeadUid}
                  onChange={(e) =>
                    setModalForm((prev) => ({
                      ...prev,
                      teamLeadUid: e.target.value,
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
                  value={modalForm.memberCsv}
                  onChange={(e) =>
                    setModalForm((prev) => ({
                      ...prev,
                      memberCsv: e.target.value,
                      verifiedSnapshot: '',
                      uidLookupRows: [],
                      uidLookupMessage: '',
                    }))
                  }
                />
                <p className="md:col-span-2 text-[11px] text-[#434651]">
                  UID format: XX-BRANCHYY-ZZ (example: 24-COMPD13-28)
                </p>

                <button
                  type="button"
                  onClick={() => void handleFetchUidDetails()}
                  className="border border-[#002155] text-[#002155] px-3 py-2 text-xs font-bold uppercase tracking-wider md:w-fit hover:bg-[#002155] hover:text-white transition-colors"
                  disabled={modalForm.lookupLoading || modalForm.submitLoading}
                >
                  {modalForm.lookupLoading ? 'Fetching UID Details...' : 'Fetch UID Details'}
                </button>

                {modalForm.uidLookupMessage ? (
                  <p className={`md:col-span-2 text-xs ${modalForm.verifiedSnapshot ? 'text-green-700' : 'text-[#8c4f00]'}`}>
                    {modalForm.uidLookupMessage}
                  </p>
                ) : null}

                {modalForm.uidLookupRows.length > 0 ? (
                  <div className="md:col-span-2 border border-[#e3e2df] bg-[#faf9f5] p-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#002155]">UID Verification Results</p>
                    <ul className="mt-2 space-y-2">
                      {modalForm.uidLookupRows.map((row) => (
                        <li key={row.uid} className="text-xs text-[#434651]">
                          <span className="font-bold text-[#002155]">{row.uid}</span>:{' '}
                          {row.found ? `${row.name || 'Unknown'} (${row.email || 'No email'})` : 'Not found'}
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

                <div className="md:col-span-2 border-2 border-dashed border-[#0b6b2e] bg-[#f2fbf4] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#0b6b2e] mb-1">
                    Required Upload: Technical Document
                  </p>
                  <p className="text-xs text-[#434651] mb-2">Accepted formats: PDF, DOC, DOCX.</p>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) =>
                      setModalForm((prev) => ({ ...prev, technicalDocument: e.target.files?.[0] ?? null }))
                    }
                    required
                  />
                  <p className="mt-2 text-[11px] text-[#434651]">
                    {modalForm.technicalDocument ? `Selected: ${modalForm.technicalDocument.name}` : 'No file selected yet.'}
                  </p>
                </div>

                <div className="md:col-span-2 border-2 border-dashed border-[#0b6b2e] bg-[#f2fbf4] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#0b6b2e] mb-1">
                    Required Upload: Presentation Deck
                  </p>
                  <p className="text-xs text-[#434651] mb-2">Accepted formats: PPT, PPTX.</p>
                  <input
                    type="file"
                    accept=".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                    onChange={(e) =>
                      setModalForm((prev) => ({ ...prev, pptFile: e.target.files?.[0] ?? null }))
                    }
                    required
                  />
                  <p className="mt-2 text-[11px] text-[#434651]">
                    {modalForm.pptFile ? `Selected: ${modalForm.pptFile.name}` : 'No file selected yet.'}
                  </p>
                </div>

                {/* Modal Footer Actions */}
                <div className="md:col-span-2 flex items-center justify-end gap-3 pt-2 border-t border-[#e3e2df] mt-1">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="border border-[#747782] text-[#434651] px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-[#f5f4f0] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-[#002155] text-white px-5 py-2 text-xs font-bold uppercase tracking-wider hover:bg-[#003380] transition-colors disabled:opacity-60"
                    disabled={modalForm.submitLoading}
                  >
                    {modalForm.submitLoading ? 'Submitting...' : 'Submit Registration'}
                  </button>
                </div>
              </form>
            </div>
          </>
        )}
      </dialog>
    </main>
  );
}