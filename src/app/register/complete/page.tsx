'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DEFAULT_CALLBACK_URL, isValidCallbackUrl } from '@/lib/callback-url';

type ParsedUidDetails = {
  normalizedUid: string;
  startYear: string;
  endYear: string;
  branch: string;
  division: string;
  rollNo: string;
};

export default function RegisterCompletePage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [uid, setUid] = useState('');
  const [phone, setPhone] = useState('');

  // Field errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // UID preview modal
  const [uidPreview, setUidPreview] = useState<ParsedUidDetails | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prefilledName = params.get('name') || '';
    const prefilledEmail = params.get('email') || '';
    setName(prefilledName);
    setEmail(prefilledEmail);
    setLoading(false);
  }, []);

  const parseUidForPreview = (rawUid: string): ParsedUidDetails | null => {
    const normalizedUid = rawUid.trim().toUpperCase();
    const match = normalizedUid.match(
      /^(\d{2})-([A-Z]+)([A-Z])(\d{2,3})-(\d{2})$/,
    );
    if (!match) return null;

    const [, startYearShort, branchPart, division, rollNo, endYearShort] = match;

    return {
      normalizedUid,
      startYear: `20${startYearShort}`,
      endYear: `20${endYearShort}`,
      branch: branchPart,
      division,
      rollNo,
    };
  };

  const extractErrorCode = (errors: unknown[]): string | null => {
    if (!Array.isArray(errors) || errors.length === 0) return null;
    const first = errors[0];
    return typeof first === 'string' ? first : null;
  };

  const handleFormSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setStatus('');
    setFieldErrors({});

    // Parse UID and show preview modal first, like the login page does
    const parsed = parseUidForPreview(uid);
    if (!parsed) {
      setFieldErrors({ uid: 'Invalid UID format. Expected e.g. 24-COMPD13-28' });
      setError('Invalid UID format. Use STARTYEAR-BRANCHDIVISIONROLLNO-ENDYEAR (example: 24-COMPD13-28).');
      return;
    }

    setUidPreview(parsed);
  };

  const handleConfirmRegistration = async () => {
    if (!uidPreview) return;

    setError('');
    setStatus('');
    setFieldErrors({});
    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/register/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, uid: uidPreview.normalizedUid, phone }),
        credentials: 'include',
      });

      const data = await res.json();

      if (!res.ok) {
        const errorCode = extractErrorCode(data?.errors);

        if (errorCode === 'GOOGLE_REGISTRATION_MISSING' || errorCode === 'GOOGLE_REGISTRATION_EXPIRED') {
          setUidPreview(null);
          setStatus('Your registration session expired. Redirecting to login...');
          setTimeout(() => { window.location.href = '/login'; }, 2000);
          return;
        }

        if (errorCode === 'EMAIL_EXISTS') {
          setUidPreview(null);
          setError('This email was already registered. Redirecting to login...');
          setTimeout(() => { window.location.href = '/login'; }, 2000);
          return;
        }

        if (errorCode === 'UID_EXISTS') {
          setUidPreview(null);
          setFieldErrors({ uid: 'This UID is already registered.' });
          setError('This UID is already registered. Please use a different UID.');
          return;
        }

        if (errorCode === 'GOOGLE_ALREADY_LINKED') {
          setUidPreview(null);
          setError('This Google account is already linked. Redirecting to login...');
          setTimeout(() => { window.location.href = '/login'; }, 2000);
          return;
        }

        // Validation errors
        if (res.status === 400 && data?.errors) {
          setUidPreview(null);
          const fieldErrMap: Record<string, string> = {};
          for (const msg of data.errors) {
            const msgStr = String(msg);
            if (msgStr.toLowerCase().includes('uid')) fieldErrMap.uid = msgStr;
            if (msgStr.toLowerCase().includes('phone')) fieldErrMap.phone = msgStr;
            if (msgStr.toLowerCase().includes('name')) fieldErrMap.name = msgStr;
          }
          setFieldErrors(fieldErrMap);
          setError(data?.message || 'Please correct the errors below.');
          return;
        }

        throw new Error(data?.message || 'Registration failed.');
      }

      // Success — navigate to destination
      setUidPreview(null);
      const params = new URLSearchParams(window.location.search);
      const callbackUrl = params.get('callbackUrl') || '';
      const destination = isValidCallbackUrl(callbackUrl) ? callbackUrl : DEFAULT_CALLBACK_URL;
      window.location.assign(destination);
    } catch (err) {
      setUidPreview(null);
      const message = err instanceof Error ? err.message : 'Registration failed. Please try again.';
      setError(message);
      setStatus('');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen pt-[120px] pb-16 px-4 md:px-8">
        <section className="max-w-lg mx-auto">
          <div className="border border-[#c4c6d3] bg-white p-8">
            <p className="text-sm text-[#434651]">Loading...</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen pt-[120px] pb-16 px-4 md:px-8">
      <section className="max-w-lg mx-auto">
        <div className="bg-[#002155] text-white p-6 md:p-8">
          <p className="text-xs uppercase tracking-[0.35em] text-[#fd9923]">
            Complete Registration
          </p>
          <h1 className="font-headline text-3xl md:text-4xl leading-tight mt-2">
            Set Up Your
            <span className="block text-[#fd9923]">Account Details</span>
          </h1>
          <p className="mt-3 text-sm text-white/80">
            Your Google account was verified. Fill in the remaining details to complete registration.
          </p>
        </div>

        <div className="border border-[#c4c6d3] bg-white p-6 md:p-8">
          {error ? (
            <p className="mb-4 border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</p>
          ) : null}
          {status ? (
            <p className="mb-4 border border-green-200 bg-green-50 text-green-700 px-4 py-3 text-sm">{status}</p>
          ) : null}

          <form className="space-y-5" onSubmit={handleFormSubmit}>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-[#434651]">
                Email (from Google)
              </label>
              <input
                type="email"
                value={email}
                readOnly
                className="w-full border border-[#d9dbe5] bg-[#f8f9fc] p-3 text-sm text-[#747782] outline-none"
              />
              <p className="text-[11px] text-[#434651]">
                Email is verified by Google and cannot be changed.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-[#434651]">
                Full Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                className={`w-full border p-3 text-sm outline-none focus:border-[#002155] ${
                  fieldErrors.name ? 'border-red-400 bg-red-50' : 'border-[#747782]'
                }`}
              />
              {fieldErrors.name && (
                <p className="text-[11px] text-red-600">{fieldErrors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-[#434651]">
                Student UID
              </label>
              <input
                type="text"
                required
                value={uid}
                onChange={(e) => setUid(e.target.value.toUpperCase())}
                placeholder="24-COMPD13-28"
                className={`w-full border p-3 text-sm outline-none focus:border-[#002155] ${
                  fieldErrors.uid ? 'border-red-400 bg-red-50' : 'border-[#747782]'
                }`}
              />
              {fieldErrors.uid ? (
                <p className="text-[11px] text-red-600">{fieldErrors.uid}</p>
              ) : (
                <p className="text-[11px] text-[#434651]">
                  Format: STARTYEAR-BRANCHDIVISIONROLLNO-ENDYEAR (e.g., 24-COMPD13-28)
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-[#434651]">
                Phone
              </label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="10-digit phone number"
                className={`w-full border p-3 text-sm outline-none focus:border-[#002155] ${
                  fieldErrors.phone ? 'border-red-400 bg-red-50' : 'border-[#747782]'
                }`}
              />
              {fieldErrors.phone && (
                <p className="text-[11px] text-red-600">{fieldErrors.phone}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#002155] text-white py-3 text-xs font-bold uppercase tracking-[0.3em] hover:bg-[#1a438e] disabled:opacity-70"
            >
              {submitting ? 'Completing Registration...' : 'Complete Registration'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-[#d9dbe5]">
            <Link href="/login" className="text-xs font-bold uppercase tracking-wider text-[#8c4f00] hover:text-[#002155]">
              ← Back to Login
            </Link>
          </div>
        </div>
      </section>

      {uidPreview ? (
        <div className="fixed inset-0 z-[98] flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-[#00122f]/60"
            onClick={() => setUidPreview(null)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Confirm student UID"
            className="relative w-full max-w-lg border border-[#c4c6d3] bg-white p-6 md:p-7 shadow-2xl"
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#8c4f00]">
              Verify UID Details
            </p>
            <h3 className="mt-1 font-headline text-2xl text-[#002155]">
              Confirm Before Completing Registration
            </h3>
            <p className="mt-3 text-sm text-[#434651]">
              Please verify the extracted details from your UID.
            </p>

            <div className="mt-4 rounded border border-[#d9dbe5] bg-[#f8f9fc] p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-[#747782]">
                Normalized UID
              </p>
              <p className="mt-1 text-sm font-bold text-[#002155]">
                {uidPreview.normalizedUid}
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-[#747782]">Start Year:</span>{" "}
                  <span className="font-bold text-[#002155]">
                    {uidPreview.startYear}
                  </span>
                </p>
                <p>
                  <span className="text-[#747782]">End Year:</span>{" "}
                  <span className="font-bold text-[#002155]">
                    {uidPreview.endYear}
                  </span>
                </p>
                <p>
                  <span className="text-[#747782]">Branch:</span>{" "}
                  <span className="font-bold text-[#002155]">
                    {uidPreview.branch}
                  </span>
                </p>
                <p>
                  <span className="text-[#747782]">Division:</span>{" "}
                  <span className="font-bold text-[#002155]">
                    {uidPreview.division}
                  </span>
                </p>
                <p className="sm:col-span-2">
                  <span className="text-[#747782]">Roll No:</span>{" "}
                  <span className="font-bold text-[#002155]">
                    {uidPreview.rollNo}
                  </span>
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setUidPreview(null)}
                className="border border-[#c4c6d3] bg-white px-4 py-2 text-xs font-bold uppercase tracking-widest text-[#434651] hover:border-[#002155] hover:text-[#002155]"
              >
                Edit UID
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmRegistration()}
                disabled={submitting}
                className="border border-[#002155] bg-[#002155] px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-[#1a438e] disabled:opacity-70"
              >
                {submitting ? "Completing Registration..." : "Looks Correct, Complete Registration"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
