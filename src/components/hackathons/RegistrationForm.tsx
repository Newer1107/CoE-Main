"use client";

import Link from "next/link";
import { useState } from "react";

type RegistrationFormProps = {
  eventId: number;
  // Config is an opaque JSON blob from the DB (event.config); the type is part
  // of the cross-component contract with the hackathon detail page.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: Record<string, any>;
  problems: { id: number; title: string }[];
  onRegistered?: () => void;
};

const inputClass =
  "w-full border border-outline-variant bg-white px-3 py-2 text-sm text-primary placeholder:text-outline focus:border-primary focus:outline-none";
const labelClass =
  "block text-xs font-bold uppercase tracking-wider text-on-surface-variant";

export default function RegistrationForm({
  eventId,
  config,
  problems,
  onRegistered,
}: RegistrationFormProps) {
  const registration = config?.registration ?? {};

  const requiresProblemSelection = registration.requiresProblemSelection !== false;
  const requiresPpt = registration.requiresPpt !== false;
  const minTeamSize = Number(registration.minTeamSize) || 1;
  const maxTeamSize = Number(registration.maxTeamSize) || 4;

  const [teamName, setTeamName] = useState("");
  const [teamSize, setTeamSize] = useState(Math.min(minTeamSize, maxTeamSize));
  const [teamLeadUid, setTeamLeadUid] = useState("");
  const [memberUids, setMemberUids] = useState<string[]>(() =>
    Array.from({ length: Math.max(0, Math.min(minTeamSize, maxTeamSize) - 1) }, () => "")
  );
  const [problemId, setProblemId] = useState("");
  const [pptFile, setPptFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState("");

  const handleTeamSizeChange = (value: number) => {
    const nextSize = Math.min(
      Math.max(Number.isFinite(value) ? Math.trunc(value) : minTeamSize, minTeamSize),
      maxTeamSize
    );
    setTeamSize(nextSize);
    setMemberUids((prev) => {
      const target = nextSize - 1;
      if (prev.length === target) return prev;
      return Array.from({ length: target }, (_, i) => prev[i] ?? "");
    });
  };

  const updateMemberUid = (index: number, value: string) => {
    setMemberUids((prev) => prev.map((uid, i) => (i === index ? value : uid)));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setErrorMessage("");
    setFieldErrors([]);

    try {
      const formData = new FormData();
      formData.append("teamName", teamName.trim());
      formData.append("teamSize", String(teamSize));
      formData.append("teamLeadUid", teamLeadUid.trim().toUpperCase());

      const uids = memberUids
        .map((uid) => uid.trim().toUpperCase())
        .filter((uid) => uid.length > 0);
      if (uids.length > 0) {
        formData.append("memberUids", uids.join(","));
      }
      if (requiresProblemSelection && problemId) {
        formData.append("problemId", problemId);
      }
      if (pptFile) {
        formData.append("pptFile", pptFile);
      }

      const res = await fetch(`/api/innovation/events/${eventId}/register`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const payload = (await res.json().catch(() => null)) as {
        success?: boolean;
        message?: string;
        errors?: string[];
      } | null;

      if (res.ok && payload?.success) {
        setSuccessMessage(payload.message || "Registration successful!");
        onRegistered?.();
        return;
      }

      setErrorMessage(payload?.message || "Registration failed. Please try again.");
      setFieldErrors(payload?.errors ?? []);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Network error. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  if (successMessage) {
    return (
      <div className="border border-[#c4c6d3] bg-white p-5 md:p-6">
        <h3 className="font-headline text-2xl text-[#002155]">Registration submitted</h3>
        <p className="mt-2 text-sm text-[#434651]">{successMessage}</p>
        <Link
          href="/hackathons/my"
          className="inline-flex mt-4 bg-[#002155] text-white px-5 py-3 text-xs font-bold uppercase tracking-wider"
        >
          View My Registrations
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-[#c4c6d3] bg-white p-5 md:p-6 space-y-5"
    >
      <h3 className="font-headline text-2xl text-[#002155]">Register Your Team</h3>

      {requiresProblemSelection ? (
        <div>
          <label htmlFor="problem-statement" className={labelClass}>
            Problem Statement
          </label>
          <select
            id="problem-statement"
            required
            value={problemId}
            onChange={(event) => setProblemId(event.target.value)}
            className={`${inputClass} mt-1 cursor-pointer`}
          >
            <option value="">Select a problem statement</option>
            {problems.map((problem) => (
              <option key={problem.id} value={problem.id}>
                {problem.title}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div>
        <label htmlFor="team-name" className={labelClass}>
          Team Name
        </label>
        <input
          id="team-name"
          type="text"
          required
          minLength={2}
          value={teamName}
          onChange={(event) => setTeamName(event.target.value)}
          placeholder="e.g. Code Crusaders"
          className={`${inputClass} mt-1`}
        />
      </div>

      <div>
        <label htmlFor="team-size" className={labelClass}>
          Team Size
        </label>
        <input
          id="team-size"
          type="number"
          required
          min={minTeamSize}
          max={maxTeamSize}
          value={teamSize}
          onChange={(event) => handleTeamSizeChange(event.target.valueAsNumber)}
          className={`${inputClass} mt-1`}
        />
        <p className="mt-1 text-xs text-[#747782]">
          Between {minTeamSize} and {maxTeamSize} members (including team lead).
        </p>
      </div>

      <div>
        <label htmlFor="team-lead-uid" className={labelClass}>
          Team Lead UID
        </label>
        <input
          id="team-lead-uid"
          type="text"
          required
          pattern="\\d{2}-[A-Z]+[A-Z]\\d{1,3}-\\d{2}"
          title="UID format: e.g. 24-COMPD13-28"
          value={teamLeadUid}
          onChange={(event) => setTeamLeadUid(event.target.value.toUpperCase())}
          placeholder="24-COMPD13-28"
          className={`${inputClass} mt-1 uppercase`}
        />
        <p className="mt-1 text-xs text-[#747782]">e.g. 24-COMPD13-28</p>
      </div>

      {memberUids.map((uid, index) => (
        <div key={index}>
          <label htmlFor={`member-uid-${index}`} className={labelClass}>
            Member {index + 1} UID
          </label>
          <input
            id={`member-uid-${index}`}
            type="text"
            required
            pattern="\\d{2}-[A-Z]+[A-Z]\\d{1,3}-\\d{2}"
            title="UID format: e.g. 24-COMPD13-28"
            value={uid}
            onChange={(event) => updateMemberUid(index, event.target.value.toUpperCase())}
            placeholder="24-COMPD13-28"
            className={`${inputClass} mt-1 uppercase`}
          />
        </div>
      ))}

      {requiresPpt ? (
        <div>
          <label htmlFor="ppt-file" className={labelClass}>
            Presentation (PPT)
          </label>
          <input
            id="ppt-file"
            type="file"
            required
            accept=".ppt,.pptx,.pdf"
            onChange={(event) => setPptFile(event.target.files?.[0] ?? null)}
            className="mt-1 block w-full border border-[#c4c6d3] bg-white px-3 py-2 text-sm text-[#434651] file:mr-3 file:border-none file:bg-[#002155] file:px-3 file:py-2 file:text-xs file:font-bold file:uppercase file:tracking-wider file:text-white"
          />
          <p className="mt-1 text-xs text-[#747782]">Accepted formats: .ppt, .pptx, .pdf</p>
        </div>
      ) : null}

      {errorMessage ? (
        <div role="alert" className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-bold">{errorMessage}</p>
          {fieldErrors.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 space-y-1">
              {fieldErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="w-full md:w-auto bg-[#002155] text-white px-6 py-3 text-xs font-bold uppercase tracking-wider hover:bg-[#1a438e] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Submitting…" : "Register Team"}
      </button>
    </form>
  );
}
