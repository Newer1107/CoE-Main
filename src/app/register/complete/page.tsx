'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DEFAULT_CALLBACK_URL, isValidCallbackUrl } from '@/lib/callback-url';

export default function RegisterCompletePage() {
  const router = useRouter();
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

  useEffect(() => {
    // Check if pending_reg exists by calling a lightweight check
    // We read from the cookie indirectly — the registration route will reject if missing
    // Prefill name and email from URL params or a brief cookie check
    const params = new URLSearchParams(window.location.search);
    const prefilledName = params.get('name') || '';
    const prefilledEmail = params.get('email') || '';
    setName(prefilledName);
    setEmail(prefilledEmail);
    setLoading(false);
  }, []);

  const extractErrorCode = (errors: unknown[]): string | null => {
    if (!Array.isArray(errors) || errors.length === 0) return null;
    const first = errors[0];
    return typeof first === 'string' ? first : null;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setStatus('');
    setFieldErrors({});
    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/register/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, uid, phone }),
        credentials: 'include',
      });

      const data = await res.json();

      if (!res.ok) {
        const errorCode = extractErrorCode(data?.errors);

        if (errorCode === 'GOOGLE_REGISTRATION_MISSING' || errorCode === 'GOOGLE_REGISTRATION_EXPIRED') {
          setStatus('Your registration session expired. Redirecting to login...');
          setTimeout(() => { window.location.href = '/login'; }, 2000);
          return;
        }

        if (errorCode === 'EMAIL_EXISTS') {
          setError('This email was already registered. Redirecting to login...');
          setTimeout(() => { window.location.href = '/login'; }, 2000);
          return;
        }

        if (errorCode === 'UID_EXISTS') {
          setFieldErrors({ uid: 'This UID is already registered.' });
          setError('This UID is already registered. Please use a different UID.');
          return;
        }

        if (errorCode === 'GOOGLE_ALREADY_LINKED') {
          setError('This Google account is already linked. Redirecting to login...');
          setTimeout(() => { window.location.href = '/login'; }, 2000);
          return;
        }

        // Validation errors
        if (res.status === 400 && data?.errors) {
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
      const params = new URLSearchParams(window.location.search);
      const callbackUrl = params.get('callbackUrl') || '';
      const destination = isValidCallbackUrl(callbackUrl) ? callbackUrl : DEFAULT_CALLBACK_URL;
      window.location.assign(destination);
    } catch (err) {
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

          <form className="space-y-5" onSubmit={handleSubmit}>
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
    </main>
  );
}
