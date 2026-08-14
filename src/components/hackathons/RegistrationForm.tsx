"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { deriveStudentInfo, formatStudentInfo } from "@/lib/student-info";
import { findSimilarProblems } from "@/lib/problem-similarity";

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
  const [metaLoaded, setMetaLoaded] = useState(false);
  const [memberUids, setMemberUids] = useState<string[]>(() =>
    Array.from({ length: Math.max(0, Math.min(minTeamSize, maxTeamSize) - 1) }, () => "")
  );
  const [problemId, setProblemId] = useState("");
  const [psQuery, setPsQuery] = useState("");
  const [psOpen, setPsOpen] = useState(false);
  const [selectedPs, setSelectedPs] = useState<{ id: number; title: string } | null>(null);
  const [psMode, setPsMode] = useState<"catalogue" | "open">("catalogue");
  const [customTitle, setCustomTitle] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const allowOpenInnovation = !!(config as { registration?: { allowOpenInnovation?: boolean } }).registration?.allowOpenInnovation;
  const similarMatches = allowOpenInnovation && customTitle.trim().length >= 20
    ? findSimilarProblems(problems, customTitle)
    : [];
  const hardDuplicate = similarMatches.find((s) => s.score >= 75) ?? null;
  const psResults = psQuery.trim()
    ? problems.filter((p) => p.title.toLowerCase().includes(psQuery.trim().toLowerCase())).slice(0, 30)
    : problems.slice(0, 30);

  const selectProblem = (p: { id: number; title: string }) => {
    setSelectedPs(p);
    setProblemId(String(p.id));
    setPsQuery(p.title);
    setPsOpen(false);
  };

  const clearProblem = () => {
    setSelectedPs(null);
    setProblemId("");
    setPsQuery("");
    setPsOpen(true);
  };
  const [pptFile, setPptFile] = useState<File | null>(null);
  const [phone, setPhone] = useState("");
  const [mentor, setMentor] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState("");

  // The logged-in student IS the team lead — their UID comes from the session,
  // never typed. Phone prefills from the profile (single source of truth).
  useEffect(() => {
    let active = true;
    void fetch(`/api/innovation/events/${eventId}/register`, { credentials: "include" })
      .then((r) => r.json())
      .then((body) => {
        if (!active) return;
        if (body?.data?.uid) setTeamLeadUid(body.data.uid);
        if (body?.data?.phone) setPhone(body.data.phone);
        setMetaLoaded(true);
      })
      .catch(() => setMetaLoaded(true));
    return () => {
      active = false;
    };
  }, [eventId]);

  // Live "confirmed from your UID" strip — derived from the session UID.
  const derived = deriveStudentInfo(teamLeadUid || null);
  const leadUnparseable = metaLoaded && teamLeadUid.length > 0 && !derived;

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

  // Live member lookup: resolve name + derived details as the UID is typed.
  type MemberLookup = { state: "idle" | "loading" | "found" | "missing" | "invalid"; name?: string; derivedText?: string; inTeamForEvent?: boolean };
  const [memberLookups, setMemberLookups] = useState<MemberLookup[]>([]);
  const lookupTimers = useRef<(ReturnType<typeof setTimeout> | null)[]>([]);

  const runLookup = (index: number, uid: string) => {
    if (lookupTimers.current[index]) clearTimeout(lookupTimers.current[index]);
    const UID_PATTERN = /^\d{2}-[A-Z0-9&]+(?:-[A-Z0-9]{1,4})?-\d{1,3}$/;
    const trimmed = uid.trim().toUpperCase();

    setMemberLookups((prev) => {
      const next = [...prev];
      next[index] = trimmed ? { state: "loading" } : { state: "idle" };
      return next;
    });

    if (!trimmed || !UID_PATTERN.test(trimmed)) {
      setMemberLookups((prev) => {
        const next = [...prev];
        next[index] = trimmed ? { state: "invalid" } : { state: "idle" };
        return next;
      });
      return;
    }

    lookupTimers.current[index] = setTimeout(async () => {
      try {
        const res = await fetch(`/api/innovation/students/lookup?uid=${encodeURIComponent(trimmed)}&eventId=${eventId}`, { credentials: "include" });
        const body = await res.json();
        const d = body?.data;
        setMemberLookups((prev) => {
          const next = [...prev];
          if (!d?.found) {
            next[index] = { state: "missing" };
          } else {
            next[index] = {
              state: "found",
              name: d.name,
              derivedText: formatStudentInfo(d.derived) ?? undefined,
              inTeamForEvent: !!d.inTeamForEvent,
            };
          }
          return next;
        });
      } catch {
        setMemberLookups((prev) => {
          const next = [...prev];
          next[index] = { state: "idle" };
          return next;
        });
      }
    }, 350);
  };

  useEffect(() => {
    return () => lookupTimers.current.forEach((t) => t && clearTimeout(t));
  }, []);

  // Duplicate / self-membership detection across all slots.
  const memberProblems: Record<number, string> = {};
  memberUids.forEach((uid, index) => {
    const trimmed = uid.trim().toUpperCase();
    if (!trimmed) return;
    if (trimmed === teamLeadUid.toUpperCase()) memberProblems[index] = "This is your own UID — the lead is added automatically.";
    else if (memberUids.some((other, i) => i !== index && other.trim().toUpperCase() === trimmed))
      memberProblems[index] = "This UID is already added above.";
  });

  const hasInvalidMembers =
    memberUids.some((uid, i) => {
      const l = memberLookups[i];
      return uid.trim() && (l?.state === "missing" || l?.state === "invalid" || !!memberProblems[i]);
    }) || memberLookups.some((l) => l?.state === "loading");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (hasInvalidMembers) {
      setErrorMessage("Please fix the member details below before registering.");
      return;
    }
    if (requiresProblemSelection && !problemId && psMode === "catalogue") {
      setErrorMessage("Please select a problem statement from the search results.");
      return;
    }
    if (psMode === "open" && customTitle.trim().length < 20) {
      setErrorMessage("Give your open-innovation problem statement a descriptive title (20+ characters).");
      return;
    }
    if (psMode === "open" && customDescription.trim().length < 50) {
      setErrorMessage("Describe the problem in at least 50 characters.");
      return;
    }
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
      if (requiresProblemSelection && psMode === "catalogue" && problemId) {
        formData.append("problemId", problemId);
      }
      if (psMode === "open") {
        formData.append("customProblemTitle", customTitle.trim());
        formData.append("customProblemDescription", customDescription.trim());
      }
      if (pptFile) {
        formData.append("pptFile", pptFile);
      }
      if (phone.trim()) {
        formData.append("phone", phone.trim());
      }
      if (mentor.trim()) {
        formData.append("mentor", mentor.trim());
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
          <label htmlFor="problem-search" className={labelClass}>
            Problem Statement
          </label>
          {allowOpenInnovation ? (
            <label className="mt-2 flex items-start gap-2 text-xs text-[#434651]">
              <input
                type="checkbox"
                checked={psMode === "open"}
                onChange={(event) => setPsMode(event.target.checked ? "open" : "catalogue")}
                className="mt-0.5 h-4 w-4 accent-[#002155]"
              />
              <span>
                This is an <span className="font-bold text-[#002155]">Open Innovation</span> submission — I will write
                my own problem statement. <span className="text-[#747782]">(Check the catalogue first to avoid
                duplicates.)</span>
              </span>
            </label>
          ) : null}

          {psMode === "open" ? (
            <div className="mt-3 space-y-3">
              <div>
                <input
                  id="custom-problem-title"
                  type="text"
                  value={customTitle}
                  onChange={(event) => setCustomTitle(event.target.value)}
                  placeholder="Your problem statement title (20+ characters)"
                  className={`${inputClass} mt-1`}
                  maxLength={180}
                />
              </div>
              <div>
                <textarea
                  id="custom-problem-description"
                  value={customDescription}
                  onChange={(event) => setCustomDescription(event.target.value)}
                  placeholder="Describe the problem, who it affects, and what a solution should achieve (at least 50 characters)."
                  className={`${inputClass} mt-1 min-h-24`}
                  maxLength={2000}
                />
              </div>

              {hardDuplicate ? (
                <div className="border border-[#ba1a1a] bg-[#fdecec] px-3 py-2 text-xs text-[#8c1616]">
                  <p className="font-bold uppercase tracking-wider">This already exists in the catalogue</p>
                  <p className="mt-1">It matches: “{hardDuplicate.title}” — please choose it from the catalogue instead.</p>
                </div>
              ) : similarMatches.length > 0 ? (
                <div className="border border-[#b77a2f] bg-[#fdf3e7] px-3 py-2 text-xs text-[#6b4a15]">
                  <p className="font-bold uppercase tracking-wider">Check the catalogue first</p>
                  <p className="mt-1">
                    Your statement looks similar to existing ones:{" "}
                    {similarMatches.slice(0, 3).map((m) => `“${m.title}”`).join(", ")} — make sure yours is genuinely
                    different.
                  </p>
                </div>
              ) : customTitle.trim().length >= 20 ? (
                <p className="text-xs font-semibold text-[#0b6b2e]">No close matches in the catalogue — looks original.</p>
              ) : (
                <p className="text-xs text-[#747782]">
                  We'll check your statement against the catalogue so you don't submit a duplicate.
                </p>
              )}
            </div>
          ) : (
            <>
          <div className="relative mt-1">
            <input
              id="problem-search"
              type="text"
              required
              value={psQuery}
              onFocus={() => setPsOpen(true)}
              onChange={(event) => {
                setPsQuery(event.target.value);
                setPsOpen(true);
              }}
              onBlur={() => setTimeout(() => setPsOpen(false), 150)}
              placeholder="Search problem statements… e.g. blockchain, ransomware"
              className={`${inputClass} pr-8`}
              autoComplete="off"
            />
            {selectedPs ? (
              <button
                type="button"
                onClick={clearProblem}
                aria-label="Clear problem selection"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#747782] hover:text-[#002155]"
              >
                ✕
              </button>
            ) : null}
            {psOpen ? (
              <ul
                className="absolute z-20 mt-1 max-h-56 w-full overflow-auto border border-[#c4c6d3] bg-white shadow-lg"
                role="listbox"
              >
                {psResults.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-[#747782]">
                    No problem statements match “{psQuery}”.
                  </li>
                ) : (
                  psResults.map((problem) => (
                    <li key={problem.id} role="option">
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectProblem(problem);
                        }}
                        className={`block w-full px-3 py-2 text-left text-sm hover:bg-[#f4f6fa] ${
                          selectedPs?.id === problem.id ? "font-bold text-[#002155]" : "text-[#434651]"
                        }`}
                      >
                        {problem.title}
                      </button>
                    </li>
                  ))
                )}
                {problems.length > 30 && !psQuery.trim() ? (
                  <li className="px-3 py-1.5 text-[11px] text-[#747782]">
                    Showing first 30 of {problems.length} — type to search.
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
          {selectedPs ? (
            <p className="mt-1 text-xs font-semibold text-[#0b6b2e]">Selected: {selectedPs.title}</p>
          ) : (
            <p className="mt-1 text-xs text-[#747782]">
              Search by keyword (domain, topic, ministry) — 502 statements available.
            </p>
          )}
            </>
          )}
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
          Team Lead (You)
        </label>
        <div className="mt-1 border border-[#c4c6d3] bg-[#f4f6fa] px-3 py-2.5">
          <p className="font-mono text-sm font-semibold uppercase tracking-wider text-[#002155]">
            {teamLeadUid || "Loading your UID…"}
          </p>
          <input type="hidden" id="team-lead-uid" name="teamLeadUid" value={teamLeadUid} readOnly />
          {derived ? (
            <div className="mt-2 border border-[#0b6b2e] bg-emerald-50 px-3 py-2">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#0b6b2e]">
                Confirmed from your UID
              </p>
              <p className="mt-0.5 text-sm font-semibold text-[#0b6b2e]">{formatStudentInfo(derived)}</p>
            </div>
          ) : leadUnparseable ? (
            <p className="mt-2 text-xs text-amber-800">
              We couldn't auto-detect your branch/year from this UID — the coordinator will confirm your details.
            </p>
          ) : null}
        </div>
      </div>

      {memberUids.map((uid, index) => {
        const lookup = memberLookups[index];
        const problem = memberProblems[index];
        return (
          <div key={index}>
            <label htmlFor={`member-uid-${index}`} className={labelClass}>
              Member {index + 1} UID
            </label>
            <input
              id={`member-uid-${index}`}
              type="text"
              required
              pattern="\d{2}-[A-Z0-9&]+(?:-[A-Z0-9]{1,4})?-\d{1,3}"
              title="UID format: e.g. 24-COMPD13-28"
              value={uid}
              onChange={(event) => {
                updateMemberUid(index, event.target.value.toUpperCase());
                runLookup(index, event.target.value);
              }}
              placeholder="24-COMPD13-28"
              className={`${inputClass} mt-1 uppercase ${
                problem || lookup?.state === "missing" || lookup?.state === "invalid"
                  ? "border-red-400 focus:border-red-500"
                  : lookup?.state === "found"
                    ? "border-[#0b6b2e] focus:border-[#0b6b2e]"
                    : ""
              }`}
            />
            {problem ? (
              <p className="mt-1 text-xs font-semibold text-red-600">{problem}</p>
            ) : lookup?.state === "loading" ? (
              <p className="mt-1 text-xs text-[#747782]">Checking UID…</p>
            ) : lookup?.state === "missing" ? (
              <p className="mt-1 text-xs font-semibold text-red-600">
                No registered student with this UID — ask them to create an account first.
              </p>
            ) : lookup?.state === "invalid" ? (
              <p className="mt-1 text-xs font-semibold text-red-600">That doesn't look like a valid UID (e.g. 24-COMPD13-28).</p>
            ) : lookup?.state === "found" ? (
              <div className="mt-1 border border-[#0b6b2e] bg-emerald-50 px-3 py-2">
                <p className="text-sm font-semibold text-[#0b6b2e]">{lookup.name}</p>
                {lookup.derivedText ? (
                  <p className="text-xs text-[#0b6b2e]/80">{lookup.derivedText}</p>
                ) : null}
                {lookup.inTeamForEvent ? (
                  <p className="mt-0.5 text-xs font-semibold text-amber-800">
                    Already in a team for this event — they can only be on one team.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-1 text-xs text-[#747782]">
                Their branch, year, division and roll auto-fill from the UID.
              </p>
            )}
          </div>
        );
      })}

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

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label htmlFor="leader-phone" className={labelClass}>
            Mobile Number
          </label>
          <input
            id="leader-phone"
            type="tel"
            readOnly
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="10-digit mobile number"
            className={`${inputClass} mt-1 bg-[#f4f6fa] text-[#434651]`}
          />
          <p className="mt-1 text-xs text-[#747782]">
            From your profile — update it in your profile settings if needed.
          </p>
        </div>
        <div>
          <label htmlFor="mentor" className={labelClass}>
            Mentor Email (optional)
          </label>
          <input
            id="mentor"
            type="email"
            maxLength={200}
            value={mentor}
            onChange={(event) => setMentor(event.target.value)}
            placeholder="faculty@tcetmumbai.in"
            className={`${inputClass} mt-1`}
          />
          <p className="mt-1 text-xs text-[#747782]">
            Preferably from your department — we'll contact them with your team details.
          </p>
        </div>
      </div>

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
