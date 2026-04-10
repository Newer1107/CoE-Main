"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import jsQR from "jsqr";
import { HACKATHON_RUBRIC_WEIGHTS } from "@/lib/hackathon-scoring";

type BookingStudent = {
  id: number;
  name: string;
  email: string;
  uid: string | null;
};

type Booking = {
  id: number;
  purpose: string;
  date: string;
  timeSlot: string;
  lab: string;
  facilities: string[];
  status: string;
  adminNote: string | null;
  createdAt: string;
  ticket: {
    id: number;
    ticketId: string;
    status: string;
    usedAt: string | null;
  } | null;
  student: BookingStudent;
};

type FacultyUser = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  uid: string | null;
  isVerified: boolean;
  status: string;
  createdAt: string;
};

type Stats = {
  totalStudents: number;
  totalFaculty: number;
  pendingBookings: number;
  confirmedBookings: number;
  activeGrants: number;
  newsCount: number;
};

type HeroSlide = {
  id: number;
  title: string;
  caption: string;
  imageUrl: string | null;
  createdAt: string;
};

type InnovationSubmission = {
  id: number;
  teamName: string | null;
  status: string;
  updatedAt: string;
  problem: {
    id: number;
    title: string;
    event: { id: number; title: string; status: string } | null;
  };
};

type InnovationEvent = {
  id: number;
  title: string;
  description: string | null;
  status: "UPCOMING" | "ACTIVE" | "JUDGING" | "CLOSED";
  registrationOpen: boolean;
  startTime: string;
  endTime: string;
  submissionLockAt: string | null;
  totalInterested: number;
  totalInterestedWithDetails: number;
};

type InnovationEventInterest = {
  eventId: number;
  eventTitle: string;
  eventStatus: "UPCOMING" | "ACTIVE" | "JUDGING" | "CLOSED";
  totalInterested: number;
  totalWithDetails: number;
  interestedStudents: Array<{
    id: number;
    userId: number;
    hasDetails: boolean;
    teamName: string | null;
    teamSize: number | null;
    createdAt: string;
    user: {
      id: number;
      name: string;
      email: string;
      uid: string | null;
      phone: string | null;
    };
  }>;
};

type ManagedHackathonSubmission = {
  id: number;
  teamName: string | null;
  status: "IN_PROGRESS" | "SUBMITTED" | "SHORTLISTED" | "ACCEPTED" | "REVISION_REQUESTED" | "REJECTED";
  updatedAt: string;
  feedback: string | null;
  innovationScore: number | null;
  technicalScore: number | null;
  impactScore: number | null;
  uxScore: number | null;
  executionScore: number | null;
  presentationScore: number | null;
  feasibilityScore: number | null;
  finalScore: number | null;
  submissionUrl: string | null;
  submissionFileUrl: string | null;
  teamTicket: {
    ticketId: string;
    status: "ACTIVE" | "USED" | "CANCELLED";
  } | null;
  attendanceSummary: {
    presentCount: number;
    totalMembers: number;
    memberAttendance: Array<{
      claimMemberId: number;
      userId: number;
      name: string;
      email: string;
      role: string;
      attendanceStatus: "NOT_PRESENT" | "PRESENT";
      checkedInAt: string | null;
    }>;
  };
  problem: {
    id: number;
    title: string;
    event: { id: number; title: string; status: string } | null;
  };
  members: Array<{
    id: number;
    role: string;
    user: { id: number; name: string; email: string; uid: string | null; phone: string | null };
  }>;
};

type HackathonRubrics = {
  innovation: number;
  technical: number;
  impact: number;
  ux: number;
  execution: number;
  presentation: number;
  feasibility: number;
};

type HackathonRubricKey = keyof HackathonRubrics;

type StagedHackathonDecision = "SHORTLISTED" | "REJECTED" | "ACCEPTED";

const rubricFieldConfig: Array<{ key: HackathonRubricKey; label: string; weight: number }> = [
  { key: "innovation", label: "Innovation", weight: HACKATHON_RUBRIC_WEIGHTS.innovation },
  { key: "technical", label: "Technical", weight: HACKATHON_RUBRIC_WEIGHTS.technical },
  { key: "impact", label: "Impact", weight: HACKATHON_RUBRIC_WEIGHTS.impact },
  { key: "ux", label: "UX", weight: HACKATHON_RUBRIC_WEIGHTS.ux },
  { key: "execution", label: "Execution", weight: HACKATHON_RUBRIC_WEIGHTS.execution },
  { key: "presentation", label: "Presentation", weight: HACKATHON_RUBRIC_WEIGHTS.presentation },
  { key: "feasibility", label: "Feasibility", weight: HACKATHON_RUBRIC_WEIGHTS.feasibility },
];

const clampRubricScore = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 10) return 10;
  return Math.round(value);
};

type EventProblemInput = {
  title: string;
  description: string;
  isIndustryProblem: boolean;
  industryName: string;
};

type InnovationLeaderboardRow = {
  rank: number;
  teamName: string;
  score: number;
  members: { id: number; name: string; email: string; role: string }[];
};

type AdminPanelClientProps = {
  stats: Stats;
  pendingBookings: Booking[];
  upcomingConfirmedBookings: Booking[];
  pendingFaculty: FacultyUser[];
  users: FacultyUser[];
  heroSlides: HeroSlide[];
  innovationSubmissions: InnovationSubmission[];
  innovationEvents: InnovationEvent[];
  innovationEventInterests: InnovationEventInterest[];
};

type EmailQueueStatus = "PENDING" | "PROCESSING" | "RETRY" | "SENT" | "FAILED";

type EmailQueueItem = {
  id: number;
  toEmail: string;
  subject: string;
  category: string;
  mode: "IMMEDIATE" | "BULK";
  status: EmailQueueStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  lastAttemptAt: string | null;
  sentAt: string | null;
  lastError: string | null;
  createdAt: string;
};

type EmailQueueSnapshot = {
  items: EmailQueueItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<EmailQueueStatus, number>;
};

type TicketVerificationResult = {
  mode: "FACILITY" | "HACKATHON";
  ticketId: string;
  status: string;
  title: string;
  subjectName: string;
  usedAt?: string | null;
  user?: {
    id: number;
    name: string;
    email: string;
  };
  teamName?: string;
  eventName?: string;
  claimId?: number;
  presentCount?: number;
  totalMembers?: number;
  newlyMarkedCount?: number;
  members?: Array<{
    claimMemberId: number;
    userId: number;
    name: string;
    email: string;
    uid?: string | null;
    role: string;
    attendanceStatus: "NOT_PRESENT" | "PRESENT";
    checkedInAt: string | null;
  }>;
};

type OperationsTab = "overview" | "bookings" | "faculty" | "tickets" | "content" | "emails";

const apiCall = async (url: string, options?: RequestInit) => {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    credentials: "include",
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.message || "Request failed");
  }
  return payload;
};

const extractTicketIdFromInput = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    const fromQuery = parsed.searchParams.get("ticketId")?.trim();
    if (fromQuery) return fromQuery;

    const segments = parsed.pathname.split("/").filter(Boolean);
    const ticketsIndex = segments.findIndex((segment) => segment === "tickets");
    if (ticketsIndex >= 0) {
      const nextSegment = segments[ticketsIndex + 1]?.trim();
      if (nextSegment) {
        try {
          return decodeURIComponent(nextSegment);
        } catch {
          return nextSegment;
        }
      }
    }
  } catch {
    // Not a URL; keep raw ticket input.
  }

  return trimmed;
};

const parseTimeSlotPart = (raw: string) => {
  const match = raw.trim().match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return { hours, minutes };
};

const getBookingScheduleDateTime = (booking: Booking, boundary: "start" | "end") => {
  const base = new Date(booking.date);
  const [startRaw = "", endRaw = ""] = booking.timeSlot.split("-").map((part) => part.trim());
  const targetRaw = boundary === "end" ? endRaw || startRaw : startRaw || endRaw;
  const parsed = parseTimeSlotPart(targetRaw);

  if (parsed) {
    base.setHours(parsed.hours, parsed.minutes, 0, 0);
    return base;
  }

  if (boundary === "end") {
    base.setHours(23, 59, 59, 999);
  } else {
    base.setHours(0, 0, 0, 0);
  }

  return base;
};

const compareBookingsByScheduleAsc = (a: Booking, b: Booking) => {
  const aTime = getBookingScheduleDateTime(a, "start").getTime();
  const bTime = getBookingScheduleDateTime(b, "start").getTime();
  if (aTime !== bTime) return aTime - bTime;
  return a.timeSlot.localeCompare(b.timeSlot);
};

export default function AdminPanelClient({
  stats,
  pendingBookings,
  upcomingConfirmedBookings,
  pendingFaculty,
  users,
  heroSlides,
  innovationSubmissions,
  innovationEvents,
  innovationEventInterests,
}: AdminPanelClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [busyBookingId, setBusyBookingId] = useState<number | null>(null);
  const [busyFacultyId, setBusyFacultyId] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [heroTitle, setHeroTitle] = useState("");
  const [heroCaption, setHeroCaption] = useState("");
  const [heroImage, setHeroImage] = useState<File | null>(null);
  const [heroUploading, setHeroUploading] = useState(false);
  const [activeView, setActiveView] = useState<"operations" | "innovation">("operations");
  const [busyInnovationEventId, setBusyInnovationEventId] = useState<number | null>(null);
  const [selectedInnovationEventId, setSelectedInnovationEventId] = useState<number | null>(null);
  const [innovationLeaderboard, setInnovationLeaderboard] = useState<InnovationLeaderboardRow[]>([]);
  const [loadingInnovationLeaderboard, setLoadingInnovationLeaderboard] = useState(false);
  const [managedSubmissions, setManagedSubmissions] = useState<ManagedHackathonSubmission[]>([]);
  const [loadingManagedSubmissions, setLoadingManagedSubmissions] = useState(false);
  const [managedSubmissionEventFilter, setManagedSubmissionEventFilter] = useState<number | "ALL">("ALL");
  const [judgingRubricsByClaimId, setJudgingRubricsByClaimId] = useState<Record<number, HackathonRubrics>>({});
  const [stagedDecisions, setStagedDecisions] = useState<Record<number, StagedHackathonDecision>>({});
  const [syncingStage, setSyncingStage] = useState<"SCREENING" | "JUDGING" | null>(null);

  const [eventTitle, setEventTitle] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventStartTime, setEventStartTime] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");
  const [eventSubmissionLockAt, setEventSubmissionLockAt] = useState("");
  const [eventPptFile, setEventPptFile] = useState<File | null>(null);
  const [eventCreating, setEventCreating] = useState(false);
  const [eventProblems, setEventProblems] = useState<EventProblemInput[]>([
    {
      title: "",
      description: "",
      isIndustryProblem: false,
      industryName: "",
    },
  ]);

  const [emailSnapshot, setEmailSnapshot] = useState<EmailQueueSnapshot | null>(null);
  const [loadingEmailSnapshot, setLoadingEmailSnapshot] = useState(false);
  const [emailStatusFilter, setEmailStatusFilter] = useState<"ALL" | EmailQueueStatus>("ALL");
  const [emailModeFilter, setEmailModeFilter] = useState<"ALL" | "IMMEDIATE" | "BULK">("ALL");
  const [emailCategoryFilter, setEmailCategoryFilter] = useState("");
  const [emailPage, setEmailPage] = useState(1);
  const [emailPageSize, setEmailPageSize] = useState(25);
  const [emailFailedBadgeCount, setEmailFailedBadgeCount] = useState<number | null>(null);

  const [ticketIdInput, setTicketIdInput] = useState("");
  const [ticketVerifying, setTicketVerifying] = useState(false);
  const [ticketVerifyError, setTicketVerifyError] = useState("");
  const [ticketVerifyResult, setTicketVerifyResult] = useState<TicketVerificationResult | null>(null);
  const [selectedPresentMemberIds, setSelectedPresentMemberIds] = useState<number[]>([]);
  const [ticketScannerOpen, setTicketScannerOpen] = useState(false);
  const [ticketScannerStarting, setTicketScannerStarting] = useState(false);
  const [ticketScannerError, setTicketScannerError] = useState("");
  const [operationsTab, setOperationsTab] = useState<OperationsTab>("overview");

  const scannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const scannerFrameRef = useRef<number | null>(null);
  const scannerRunningRef = useRef(false);

  const recentUsers = useMemo(() => users.slice(0, 12), [users]);
  const prepBookings = useMemo(() => {
    const now = new Date();

    return upcomingConfirmedBookings
      .filter((booking) => getBookingScheduleDateTime(booking, "end").getTime() >= now.getTime())
      .sort(compareBookingsByScheduleAsc)
      .slice(0, 20);
  }, [upcomingConfirmedBookings]);

  const completedConfirmedBookings = useMemo(() => {
    const now = new Date();

    return upcomingConfirmedBookings
      .filter((booking) => getBookingScheduleDateTime(booking, "end").getTime() < now.getTime())
      .sort((a, b) => compareBookingsByScheduleAsc(b, a));
  }, [upcomingConfirmedBookings]);

  const attendedCompletedBookings = useMemo(
    () => completedConfirmedBookings.filter((booking) => Boolean(booking.ticket?.usedAt)),
    [completedConfirmedBookings]
  );

  const unattendedCompletedBookings = useMemo(
    () => completedConfirmedBookings.filter((booking) => !booking.ticket?.usedAt),
    [completedConfirmedBookings]
  );

  const filteredManagedSubmissions = useMemo(() => {
    if (managedSubmissionEventFilter === "ALL") return managedSubmissions;
    return managedSubmissions.filter((claim) => claim.problem.event?.id === managedSubmissionEventFilter);
  }, [managedSubmissions, managedSubmissionEventFilter]);

  const screeningSubmissions = useMemo(
    () => filteredManagedSubmissions.filter((claim) => ["IN_PROGRESS", "SUBMITTED", "REVISION_REQUESTED"].includes(claim.status)),
    [filteredManagedSubmissions]
  );

  const judgingSubmissions = useMemo(
    () => filteredManagedSubmissions.filter((claim) => claim.status === "SHORTLISTED"),
    [filteredManagedSubmissions]
  );

  const finalizedSubmissions = useMemo(
    () => filteredManagedSubmissions.filter((claim) => ["ACCEPTED", "REJECTED"].includes(claim.status)),
    [filteredManagedSubmissions]
  );

  const eventInterestById = useMemo(() => {
    const map = new Map<number, InnovationEventInterest>();
    for (const item of innovationEventInterests) {
      map.set(item.eventId, item);
    }
    return map;
  }, [innovationEventInterests]);

  const stagedScreeningCount = useMemo(
    () => screeningSubmissions.filter((claim) => ["SHORTLISTED", "REJECTED"].includes(stagedDecisions[claim.id] || "")).length,
    [screeningSubmissions, stagedDecisions]
  );

  const stagedJudgingCount = useMemo(
    () => judgingSubmissions.filter((claim) => ["ACCEPTED", "REJECTED"].includes(stagedDecisions[claim.id] || "")).length,
    [judgingSubmissions, stagedDecisions]
  );

  const getDefaultRubricsForClaim = (claim: ManagedHackathonSubmission): HackathonRubrics => ({
    innovation: clampRubricScore(claim.innovationScore ?? 7),
    technical: clampRubricScore(claim.technicalScore ?? 7),
    impact: clampRubricScore(claim.impactScore ?? 7),
    ux: clampRubricScore(claim.uxScore ?? 7),
    execution: clampRubricScore(claim.executionScore ?? 7),
    presentation: clampRubricScore(claim.presentationScore ?? 7),
    feasibility: clampRubricScore(claim.feasibilityScore ?? 7),
  });

  const hydrateRubricDrafts = (claims: ManagedHackathonSubmission[]) => {
    setJudgingRubricsByClaimId((prev) => {
      const next: Record<number, HackathonRubrics> = {};
      for (const claim of claims) {
        next[claim.id] = prev[claim.id] ?? getDefaultRubricsForClaim(claim);
      }
      return next;
    });
  };

  useEffect(() => {
    const tab = searchParams.get("tab");
    const ops = searchParams.get("ops");
    const parsedQueryTicketId = extractTicketIdFromInput(searchParams.get("ticketId") || "");

    if (
      ops === "overview" ||
      ops === "bookings" ||
      ops === "faculty" ||
      ops === "tickets" ||
      ops === "content" ||
      ops === "emails"
    ) {
      setOperationsTab(ops);
    }

    if (tab === "innovation") {
      setActiveView("innovation");
    }
    if (tab === "operations") {
      setActiveView("operations");
    }

    if (parsedQueryTicketId) {
      setActiveView("operations");
      setOperationsTab("tickets");
      setTicketIdInput(parsedQueryTicketId);
      setTicketVerifyError("");
    }
  }, [searchParams]);

  useEffect(() => {
    if (activeView !== "innovation") return;

    const loadManagedSubmissions = async () => {
      try {
        setLoadingManagedSubmissions(true);
        const payload = await apiCall("/api/innovation/faculty/submissions", { method: "GET" });
        const claims = (payload?.data || []) as ManagedHackathonSubmission[];
        setManagedSubmissions(claims);
        hydrateRubricDrafts(claims);
      } catch (err) {
        setManagedSubmissions([]);
        setErrorMessage(err instanceof Error ? err.message : "Could not load hackathon submissions.");
      } finally {
        setLoadingManagedSubmissions(false);
      }
    };

    void loadManagedSubmissions();
  }, [activeView]);

  useEffect(() => {
    if (activeView !== "operations" || operationsTab !== "emails") return;

    const loadEmailSnapshot = async () => {
      try {
        setLoadingEmailSnapshot(true);
        const params = new URLSearchParams();
        params.set("page", String(emailPage));
        params.set("pageSize", String(emailPageSize));
        if (emailStatusFilter !== "ALL") params.set("status", emailStatusFilter);
        if (emailModeFilter !== "ALL") params.set("mode", emailModeFilter);
        if (emailCategoryFilter.trim()) params.set("category", emailCategoryFilter.trim());

        const payload = await apiCall(`/api/admin/emails?${params.toString()}`, { method: "GET" });
        const snapshot = (payload?.data || null) as EmailQueueSnapshot | null;
        setEmailSnapshot(snapshot);
        setEmailFailedBadgeCount(snapshot?.counts?.FAILED ?? 0);
      } catch (err) {
        setEmailSnapshot(null);
        setErrorMessage(err instanceof Error ? err.message : "Could not load email monitor data.");
      } finally {
        setLoadingEmailSnapshot(false);
      }
    };

    void loadEmailSnapshot();
  }, [activeView, operationsTab, emailStatusFilter, emailModeFilter, emailCategoryFilter, emailPage, emailPageSize]);

  const handleRefreshEmailSnapshot = async () => {
    try {
      setErrorMessage("");
      setLoadingEmailSnapshot(true);
      const params = new URLSearchParams();
      params.set("page", String(emailPage));
      params.set("pageSize", String(emailPageSize));
      if (emailStatusFilter !== "ALL") params.set("status", emailStatusFilter);
      if (emailModeFilter !== "ALL") params.set("mode", emailModeFilter);
      if (emailCategoryFilter.trim()) params.set("category", emailCategoryFilter.trim());

      const payload = await apiCall(`/api/admin/emails?${params.toString()}`, { method: "GET" });
      const snapshot = (payload?.data || null) as EmailQueueSnapshot | null;
      setEmailSnapshot(snapshot);
      setEmailFailedBadgeCount(snapshot?.counts?.FAILED ?? 0);
      setStatusMessage("Email monitor refreshed.");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not refresh email monitor.");
    } finally {
      setLoadingEmailSnapshot(false);
    }
  };

  useEffect(() => {
    if (activeView !== "operations") return;

    const loadEmailBadge = async () => {
      try {
        const payload = await apiCall("/api/admin/emails?page=1&pageSize=1", { method: "GET" });
        const snapshot = (payload?.data || null) as EmailQueueSnapshot | null;
        setEmailFailedBadgeCount(snapshot?.counts?.FAILED ?? 0);
      } catch {
        setEmailFailedBadgeCount(null);
      }
    };

    void loadEmailBadge();
  }, [activeView]);

  const stopTicketScanner = () => {
    scannerRunningRef.current = false;
    setTicketScannerOpen(false);

    if (scannerFrameRef.current !== null) {
      cancelAnimationFrame(scannerFrameRef.current);
      scannerFrameRef.current = null;
    }

    if (scannerStreamRef.current) {
      for (const track of scannerStreamRef.current.getTracks()) {
        track.stop();
      }
      scannerStreamRef.current = null;
    }

    if (scannerVideoRef.current) {
      scannerVideoRef.current.srcObject = null;
    }
  };

  const verifyTicketById = async (ticketIdRaw: string) => {
    const normalizedTicketId = extractTicketIdFromInput(ticketIdRaw);
    if (normalizedTicketId.length < 8) {
      setTicketVerifyError("Enter a valid ticket ID before verification.");
      setTicketVerifyResult(null);
      setSelectedPresentMemberIds([]);
      return;
    }

    try {
      setTicketVerifying(true);
      setTicketVerifyError("");
      setTicketVerifyResult(null);

      const payload = await apiCall("/api/tickets/verify", {
        method: "POST",
        body: JSON.stringify({ ticketId: normalizedTicketId }),
      });

      setTicketIdInput(normalizedTicketId);
      const result = (payload?.data || null) as TicketVerificationResult | null;
      setTicketVerifyResult(result);

      if (result?.mode === "HACKATHON") {
        setSelectedPresentMemberIds([]);
        setStatusMessage(`Team ticket ${normalizedTicketId} loaded. Select present members and confirm check-in.`);
      } else {
        setSelectedPresentMemberIds([]);
        setStatusMessage(`Facility ticket ${normalizedTicketId} verified.`);
      }
    } catch (err) {
      setTicketVerifyError(err instanceof Error ? err.message : "Ticket verification failed.");
    } finally {
      setTicketVerifying(false);
    }
  };

  const handleTogglePresentSelection = (claimMemberId: number) => {
    setSelectedPresentMemberIds((prev) =>
      prev.includes(claimMemberId) ? prev.filter((item) => item !== claimMemberId) : [...prev, claimMemberId]
    );
  };

  const handleMarkSelectedMembersPresent = async () => {
    if (!ticketVerifyResult || ticketVerifyResult.mode !== "HACKATHON") return;
    if (selectedPresentMemberIds.length === 0) {
      setTicketVerifyError("Select at least one team member to mark as present.");
      return;
    }

    try {
      setTicketVerifying(true);
      setTicketVerifyError("");

      const payload = await apiCall("/api/tickets/verify", {
        method: "POST",
        body: JSON.stringify({
          ticketId: ticketVerifyResult.ticketId,
          presentClaimMemberIds: selectedPresentMemberIds,
        }),
      });

      const result = (payload?.data || null) as TicketVerificationResult | null;
      setTicketVerifyResult(result);
      setSelectedPresentMemberIds([]);

      if (result?.mode === "HACKATHON") {
        setStatusMessage(
          `Marked ${result.newlyMarkedCount ?? 0} member(s) present. ${result.presentCount ?? 0}/${
            result.totalMembers ?? 0
          } checked in.`
        );
      }
    } catch (err) {
      setTicketVerifyError(err instanceof Error ? err.message : "Could not update team attendance.");
    } finally {
      setTicketVerifying(false);
    }
  };

  const handleVerifyTicket = async () => {
    await verifyTicketById(ticketIdInput);
  };

  const handleToggleTicketScanner = async () => {
    if (ticketScannerOpen || scannerRunningRef.current) {
      stopTicketScanner();
      setTicketScannerError("");
      return;
    }

    if (!("mediaDevices" in navigator) || !navigator.mediaDevices?.getUserMedia) {
      setTicketScannerError("Camera access is not available in this browser.");
      return;
    }

    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      setTicketScannerError("Camera scanning requires HTTPS on this domain. Open the admin panel over HTTPS and try again.");
      return;
    }

    try {
      setTicketScannerStarting(true);
      setTicketScannerError("");
      setTicketScannerOpen(true);

      // Ensure the preview video element is mounted before attaching stream.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
          },
          audio: false,
        });
      } catch {
        // Fallback to default camera when strict environment preference is unavailable.
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      const videoEl = scannerVideoRef.current;
      if (!videoEl) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        throw new Error("Scanner preview is not ready.");
      }

      scannerStreamRef.current = stream;
      videoEl.srcObject = stream;
      await videoEl.play();

      scannerRunningRef.current = true;

      const canvasEl = document.createElement("canvas");
      const ctx = canvasEl.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        throw new Error("Could not initialize scanner canvas.");
      }

      let lastScanAt = 0;

      const scanFrame = async (ts: number) => {
        if (!scannerRunningRef.current) return;

        const activeVideo = scannerVideoRef.current;
        if (!activeVideo || activeVideo.readyState < 2) {
          scannerFrameRef.current = requestAnimationFrame((nextTs) => {
            void scanFrame(nextTs);
          });
          return;
        }

        try {
          if (ts - lastScanAt < 110) {
            scannerFrameRef.current = requestAnimationFrame((nextTs) => {
              void scanFrame(nextTs);
            });
            return;
          }

          lastScanAt = ts;

          const width = activeVideo.videoWidth;
          const height = activeVideo.videoHeight;
          if (!width || !height) {
            scannerFrameRef.current = requestAnimationFrame((nextTs) => {
              void scanFrame(nextTs);
            });
            return;
          }

          canvasEl.width = width;
          canvasEl.height = height;
          ctx.drawImage(activeVideo, 0, 0, width, height);

          const imageData = ctx.getImageData(0, 0, width, height);
          const qrResult = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "attemptBoth",
          });
          const scannedValue = qrResult?.data?.trim();

          if (scannedValue) {
            const normalizedScannedTicketId = extractTicketIdFromInput(scannedValue);
            setTicketIdInput(normalizedScannedTicketId);
            stopTicketScanner();
            await verifyTicketById(normalizedScannedTicketId);
            return;
          }
        } catch {
          // Ignore per-frame scanner detection failures and continue scanning.
        }

        scannerFrameRef.current = requestAnimationFrame((nextTs) => {
          void scanFrame(nextTs);
        });
      };

      scannerFrameRef.current = requestAnimationFrame((nextTs) => {
        void scanFrame(nextTs);
      });
    } catch (err) {
      stopTicketScanner();
      if (err instanceof Error && err.name === "NotAllowedError") {
        setTicketScannerError("Camera permission was denied. Allow camera access in browser settings and try again.");
      } else if (err instanceof Error && err.name === "NotFoundError") {
        setTicketScannerError("No camera device was found on this browser/device.");
      } else {
        setTicketScannerError(err instanceof Error ? err.message : "Could not start ticket scanner.");
      }
    } finally {
      setTicketScannerStarting(false);
    }
  };

  useEffect(() => {
    return () => {
      stopTicketScanner();
    };
  }, []);

  useEffect(() => {
    if (operationsTab !== "tickets") {
      stopTicketScanner();
    }
  }, [operationsTab]);

  useEffect(() => {
    if (activeView !== "operations") {
      stopTicketScanner();
    }
  }, [activeView]);

  const handleConfirmBooking = async (id: number) => {
    try {
      setErrorMessage("");
      setStatusMessage("");
      setBusyBookingId(id);
      await apiCall(`/api/admin/bookings/${id}/confirm`, { method: "PATCH" });
      setStatusMessage(`Booking #${id} confirmed.`);
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not confirm booking.");
    } finally {
      setBusyBookingId(null);
    }
  };

  const handleRejectBooking = async (id: number) => {
    const adminNote = window.prompt("Optional rejection note for the student:", "") ?? "";

    try {
      setErrorMessage("");
      setStatusMessage("");
      setBusyBookingId(id);
      await apiCall(`/api/admin/bookings/${id}/reject`, {
        method: "PATCH",
        body: JSON.stringify({ adminNote }),
      });
      setStatusMessage(`Booking #${id} rejected.`);
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not reject booking.");
    } finally {
      setBusyBookingId(null);
    }
  };

  const handleApproveFaculty = async (id: number) => {
    try {
      setErrorMessage("");
      setStatusMessage("");
      setBusyFacultyId(id);
      await apiCall(`/api/admin/faculty/${id}/approve`, { method: "PATCH" });
      setStatusMessage(`Faculty user #${id} approved.`);
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not approve faculty user.");
    } finally {
      setBusyFacultyId(null);
    }
  };

  const handleRejectFaculty = async (id: number) => {
    try {
      setErrorMessage("");
      setStatusMessage("");
      setBusyFacultyId(id);
      await apiCall(`/api/admin/faculty/${id}/reject`, { method: "PATCH" });
      setStatusMessage(`Faculty user #${id} rejected.`);
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not reject faculty user.");
    } finally {
      setBusyFacultyId(null);
    }
  };

  const handleHeroUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!heroImage) {
      setErrorMessage("Please select an image for the hero slide.");
      return;
    }

    try {
      setErrorMessage("");
      setStatusMessage("");
      setHeroUploading(true);

      const formData = new FormData();
      formData.set("title", heroTitle);
      formData.set("caption", heroCaption);
      formData.set("image", heroImage);

      const res = await fetch("/api/hero-slides", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || "Could not upload hero slide.");
      }

      setHeroTitle("");
      setHeroCaption("");
      setHeroImage(null);
      setStatusMessage("Hero slide uploaded successfully.");
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not upload hero slide.");
    } finally {
      setHeroUploading(false);
    }
  };

  const handleInnovationEventStatus = async (eventId: number, status: "ACTIVE" | "JUDGING" | "CLOSED") => {
    try {
      setErrorMessage("");
      setStatusMessage("");
      setBusyInnovationEventId(eventId);

      await apiCall(`/api/innovation/admin/events/${eventId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });

      setStatusMessage(`Innovation event #${eventId} moved to ${status}.`);
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not update event status.");
    } finally {
      setBusyInnovationEventId(null);
    }
  };

  const handleLoadInnovationLeaderboard = async (eventId: number) => {
    try {
      setErrorMessage("");
      setSelectedInnovationEventId(eventId);
      setLoadingInnovationLeaderboard(true);
      const payload = await apiCall(`/api/innovation/events/${eventId}/leaderboard`, { method: "GET" });
      setInnovationLeaderboard((payload?.data || []) as InnovationLeaderboardRow[]);
    } catch (err) {
      setInnovationLeaderboard([]);
      setErrorMessage(err instanceof Error ? err.message : "Could not load innovation leaderboard.");
    } finally {
      setLoadingInnovationLeaderboard(false);
    }
  };

  const refreshManagedSubmissions = async () => {
    const payload = await apiCall("/api/innovation/faculty/submissions", { method: "GET" });
    const claims = (payload?.data || []) as ManagedHackathonSubmission[];
    setManagedSubmissions(claims);
    hydrateRubricDrafts(claims);
  };

  const handleCreateHackathonEvent = async (event: React.FormEvent) => {
    event.preventDefault();

    const problemsPayload = eventProblems
      .map((problem) => ({
        title: problem.title.trim(),
        description: problem.description.trim(),
        isIndustryProblem: problem.isIndustryProblem,
        industryName: problem.isIndustryProblem ? problem.industryName.trim() : "",
      }))
      .filter((problem) => problem.title.length > 0 || problem.description.length > 0);

    if (problemsPayload.length === 0) {
      setErrorMessage("Please add at least one problem statement for the event.");
      return;
    }

    try {
      setErrorMessage("");
      setStatusMessage("");
      setEventCreating(true);

      const formData = new FormData();
      formData.set("title", eventTitle);
      formData.set("description", eventDescription);
      formData.set("startTime", eventStartTime);
      formData.set("endTime", eventEndTime);
      formData.set("submissionLockAt", eventSubmissionLockAt);
      formData.set("problems", JSON.stringify(problemsPayload));
      if (eventPptFile) {
        formData.set("pptFile", eventPptFile);
      }

      const res = await fetch("/api/innovation/events", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.message || "Could not create hackathon event.");
      }

      setEventTitle("");
      setEventDescription("");
      setEventStartTime("");
      setEventEndTime("");
      setEventSubmissionLockAt("");
      setEventPptFile(null);
      setEventProblems([{ title: "", description: "", isIndustryProblem: false, industryName: "" }]);
      setStatusMessage("Hackathon event created successfully.");
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not create hackathon event.");
    } finally {
      setEventCreating(false);
    }
  };

  const updateEventProblem = (index: number, updates: Partial<EventProblemInput>) => {
    setEventProblems((prev) => prev.map((problem, idx) => (idx === index ? { ...problem, ...updates } : problem)));
  };

  const addEventProblemInput = () => {
    setEventProblems((prev) => [...prev, { title: "", description: "", isIndustryProblem: false, industryName: "" }]);
  };

  const removeEventProblemInput = (index: number) => {
    setEventProblems((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== index)));
  };

  const handleToggleEventRegistration = async (eventRow: InnovationEvent) => {
    try {
      setErrorMessage("");
      setStatusMessage("");
      setBusyInnovationEventId(eventRow.id);

      await apiCall(`/api/innovation/events/${eventRow.id}`, {
        method: "PATCH",
        body: JSON.stringify({ registrationOpen: !eventRow.registrationOpen }),
      });

      setStatusMessage(`Submissions ${eventRow.registrationOpen ? "closed" : "opened"} for event #${eventRow.id}.`);
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not update registration status.");
    } finally {
      setBusyInnovationEventId(null);
    }
  };

  const stageDecision = (claimId: number, status: StagedHackathonDecision) => {
    setStagedDecisions((prev) => {
      if (prev[claimId] === status) {
        const next = { ...prev };
        delete next[claimId];
        return next;
      }

      return {
        ...prev,
        [claimId]: status,
      };
    });
  };

  const updateJudgingRubric = (claimId: number, key: HackathonRubricKey, rawValue: number) => {
    setJudgingRubricsByClaimId((prev) => {
      const base = prev[claimId] || {
        innovation: 7,
        technical: 7,
        impact: 7,
        ux: 7,
        execution: 7,
        presentation: 7,
        feasibility: 7,
      };

      return {
        ...prev,
        [claimId]: {
          ...base,
          [key]: clampRubricScore(rawValue),
        },
      };
    });
  };

  const getJudgingRubrics = (claim: ManagedHackathonSubmission): HackathonRubrics => {
    return judgingRubricsByClaimId[claim.id] ?? getDefaultRubricsForClaim(claim);
  };

  const syncScreeningDecisions = async () => {
    if (managedSubmissionEventFilter === "ALL") {
      setErrorMessage("Select a specific event before syncing screening decisions.");
      return;
    }

    const decisions = screeningSubmissions
      .filter((claim) => stagedDecisions[claim.id] === "SHORTLISTED" || stagedDecisions[claim.id] === "REJECTED")
      .map((claim) => ({
        claimId: claim.id,
        status: stagedDecisions[claim.id] as "SHORTLISTED" | "REJECTED",
      }));

    if (decisions.length === 0) {
      setErrorMessage("Stage at least one screening decision before syncing.");
      return;
    }

    try {
      setErrorMessage("");
      setStatusMessage("");
      setSyncingStage("SCREENING");

      await apiCall("/api/innovation/faculty/claims/sync", {
        method: "PATCH",
        body: JSON.stringify({
          stage: "SCREENING",
          eventId: managedSubmissionEventFilter,
          decisions,
        }),
      });

      setStagedDecisions((prev) => {
        const next = { ...prev };
        for (const row of decisions) delete next[row.claimId];
        return next;
      });

      await refreshManagedSubmissions();
      setStatusMessage(`Synced ${decisions.length} screening decision(s).`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not sync screening decisions.");
    } finally {
      setSyncingStage(null);
    }
  };

  const syncJudgingDecisions = async () => {
    if (managedSubmissionEventFilter === "ALL") {
      setErrorMessage("Select a specific event before syncing final judging.");
      return;
    }

    const decisions = judgingSubmissions
      .filter((claim) => stagedDecisions[claim.id] === "ACCEPTED" || stagedDecisions[claim.id] === "REJECTED")
      .map((claim) => ({
        claimId: claim.id,
        status: stagedDecisions[claim.id] as "ACCEPTED" | "REJECTED",
        rubrics: getJudgingRubrics(claim),
      }));

    if (decisions.length === 0) {
      setErrorMessage("Stage at least one final judging decision before syncing.");
      return;
    }

    try {
      setErrorMessage("");
      setStatusMessage("");
      setSyncingStage("JUDGING");

      await apiCall("/api/innovation/faculty/claims/sync", {
        method: "PATCH",
        body: JSON.stringify({
          stage: "JUDGING",
          eventId: managedSubmissionEventFilter,
          decisions,
        }),
      });

      setStagedDecisions((prev) => {
        const next = { ...prev };
        for (const row of decisions) delete next[row.claimId];
        return next;
      });

      await refreshManagedSubmissions();
      setStatusMessage(`Synced ${decisions.length} final judging decision(s).`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not sync final judging decisions.");
    } finally {
      setSyncingStage(null);
    }
  };

  return (
    <main className="max-w-7xl mx-auto mt-10 px-4 md:px-8 pt-[120px] pb-14 min-h-screen">
      <header className="mb-8 border-l-4 border-[#002155] pl-4 md:pl-6">
        <h1 className="font-headline text-3xl md:text-[40px] font-bold tracking-tight text-[#002155] leading-none">
          Admin Control Room
        </h1>
        <p className="mt-2 text-[#434651] max-w-3xl font-body">
          Review pending booking requests, approve faculty registrations, and track platform metrics.
        </p>
      </header>

      {statusMessage ? (
        <p className="mb-4 border border-green-300 bg-green-50 text-green-800 px-4 py-3 text-sm">
          {statusMessage}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="mb-4 border border-red-300 bg-red-50 text-red-700 px-4 py-3 text-sm">
          {errorMessage}
        </p>
      ) : null}

      <section className="mb-8 flex flex-wrap gap-2">
        <button
          onClick={() => setActiveView("operations")}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border ${
            activeView === "operations" ? "bg-[#002155] text-white border-[#002155]" : "bg-white text-[#002155] border-[#c4c6d3]"
          }`}
        >
          Operations
        </button>
        <button
          onClick={() => setActiveView("innovation")}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border ${
            activeView === "innovation" ? "bg-[#002155] text-white border-[#002155]" : "bg-white text-[#002155] border-[#c4c6d3]"
          }`}
        >
          Innovation
        </button>
      </section>

      {activeView === "operations" ? (
        <>

      <section className="mb-6">
        <div className="mb-2 flex flex-wrap gap-2">
          <button
            onClick={() => setOperationsTab("overview")}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border ${
              operationsTab === "overview" ? "bg-[#002155] text-white border-[#002155]" : "bg-white text-[#002155] border-[#c4c6d3]"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setOperationsTab("bookings")}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border ${
              operationsTab === "bookings" ? "bg-[#002155] text-white border-[#002155]" : "bg-white text-[#002155] border-[#c4c6d3]"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              Bookings
              <span className={`px-2 py-[1px] rounded-full text-[10px] font-bold ${pendingBookings.length > 0 ? "bg-[#8c4f00] text-white" : "bg-[#e8e6e0] text-[#434651]"}`}>
                {pendingBookings.length}
              </span>
            </span>
          </button>
          <button
            onClick={() => setOperationsTab("faculty")}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border ${
              operationsTab === "faculty" ? "bg-[#002155] text-white border-[#002155]" : "bg-white text-[#002155] border-[#c4c6d3]"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              Faculty
              <span className={`px-2 py-[1px] rounded-full text-[10px] font-bold ${pendingFaculty.length > 0 ? "bg-[#8c4f00] text-white" : "bg-[#e8e6e0] text-[#434651]"}`}>
                {pendingFaculty.length}
              </span>
            </span>
          </button>
          <button
            onClick={() => setOperationsTab("tickets")}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border ${
              operationsTab === "tickets" ? "bg-[#002155] text-white border-[#002155]" : "bg-white text-[#002155] border-[#c4c6d3]"
            }`}
          >
            Tickets
          </button>
          <button
            onClick={() => setOperationsTab("content")}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border ${
              operationsTab === "content" ? "bg-[#002155] text-white border-[#002155]" : "bg-white text-[#002155] border-[#c4c6d3]"
            }`}
          >
            Content
          </button>
          <button
            onClick={() => setOperationsTab("emails")}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border ${
              operationsTab === "emails" ? "bg-[#002155] text-white border-[#002155]" : "bg-white text-[#002155] border-[#c4c6d3]"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              Emails
              <span
                className={`px-2 py-[1px] rounded-full text-[10px] font-bold ${
                  (emailFailedBadgeCount ?? 0) > 0 ? "bg-[#ba1a1a] text-white" : "bg-[#e8e6e0] text-[#434651]"
                }`}
              >
                {emailFailedBadgeCount ?? "-"}
              </span>
            </span>
          </button>
        </div>
        <p className="text-sm text-[#434651]">
          {operationsTab === "overview" ? "Platform summary and high-level counts." : null}
          {operationsTab === "bookings" ? "Manage incoming booking requests, prep upcoming sessions, and review attendance outcomes." : null}
          {operationsTab === "faculty" ? "Approve faculty accounts and review recent users." : null}
          {operationsTab === "tickets" ? "Verify tickets manually or by camera QR scan." : null}
          {operationsTab === "content" ? "Upload and review homepage hero slides." : null}
          {operationsTab === "emails" ? "Monitor delivery queue health and retry patterns." : null}
        </p>
      </section>

      {operationsTab === "overview" ? (
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
        <div className="border border-[#c4c6d3] bg-white p-5">
          <p className="text-xs uppercase tracking-widest text-[#434651] font-label">Total Students</p>
          <p className="mt-2 text-3xl font-bold text-[#002155]">{stats.totalStudents}</p>
        </div>
        <div className="border border-[#c4c6d3] bg-white p-5">
          <p className="text-xs uppercase tracking-widest text-[#434651] font-label">Total Faculty</p>
          <p className="mt-2 text-3xl font-bold text-[#002155]">{stats.totalFaculty}</p>
        </div>
        <div className="border border-[#c4c6d3] bg-white p-5">
          <p className="text-xs uppercase tracking-widest text-[#434651] font-label">Pending Bookings</p>
          <p className="mt-2 text-3xl font-bold text-[#8c4f00]">{stats.pendingBookings}</p>
        </div>
        <div className="border border-[#c4c6d3] bg-white p-5">
          <p className="text-xs uppercase tracking-widest text-[#434651] font-label">Confirmed Bookings</p>
          <p className="mt-2 text-3xl font-bold text-[#002155]">{stats.confirmedBookings}</p>
        </div>
        <div className="border border-[#c4c6d3] bg-white p-5">
          <p className="text-xs uppercase tracking-widest text-[#434651] font-label">Active Grants</p>
          <p className="mt-2 text-3xl font-bold text-[#002155]">{stats.activeGrants}</p>
        </div>
        <div className="border border-[#c4c6d3] bg-white p-5">
          <p className="text-xs uppercase tracking-widest text-[#434651] font-label">Visible News Posts</p>
          <p className="mt-2 text-3xl font-bold text-[#002155]">{stats.newsCount}</p>
        </div>
      </section>
      ) : null}

      {operationsTab === "emails" ? (
      <section className="mb-10 border border-[#c4c6d3] bg-white p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h2 className="font-headline text-2xl text-[#002155]">Email Monitor</h2>
            <p className="text-sm text-[#434651]">Queue visibility for pending, processing, retry, sent, and failed emails.</p>
          </div>
          <button
            onClick={() => void handleRefreshEmailSnapshot()}
            disabled={loadingEmailSnapshot}
            className="border border-[#002155] text-[#002155] px-3 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
          >
            {loadingEmailSnapshot ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          <div className="border border-[#e3e2df] bg-[#faf9f5] px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-[#434651]">Pending</p>
            <p className="text-lg font-bold text-[#8c4f00]">{emailSnapshot?.counts?.PENDING ?? 0}</p>
          </div>
          <div className="border border-[#e3e2df] bg-[#faf9f5] px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-[#434651]">Processing</p>
            <p className="text-lg font-bold text-[#002155]">{emailSnapshot?.counts?.PROCESSING ?? 0}</p>
          </div>
          <div className="border border-[#e3e2df] bg-[#faf9f5] px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-[#434651]">Retry</p>
            <p className="text-lg font-bold text-[#8c4f00]">{emailSnapshot?.counts?.RETRY ?? 0}</p>
          </div>
          <div className="border border-[#e3e2df] bg-[#faf9f5] px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-[#434651]">Sent</p>
            <p className="text-lg font-bold text-[#0b6b2e]">{emailSnapshot?.counts?.SENT ?? 0}</p>
          </div>
          <div className="border border-[#e3e2df] bg-[#faf9f5] px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-[#434651]">Failed</p>
            <p className="text-lg font-bold text-[#ba1a1a]">{emailSnapshot?.counts?.FAILED ?? 0}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <select
            value={emailStatusFilter}
            onChange={(e) => {
              setEmailPage(1);
              setEmailStatusFilter(e.target.value as "ALL" | EmailQueueStatus);
            }}
            className="border border-[#c4c6d3] px-3 py-2 text-sm"
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING">PENDING</option>
            <option value="PROCESSING">PROCESSING</option>
            <option value="RETRY">RETRY</option>
            <option value="SENT">SENT</option>
            <option value="FAILED">FAILED</option>
          </select>

          <select
            value={emailModeFilter}
            onChange={(e) => {
              setEmailPage(1);
              setEmailModeFilter(e.target.value as "ALL" | "IMMEDIATE" | "BULK");
            }}
            className="border border-[#c4c6d3] px-3 py-2 text-sm"
          >
            <option value="ALL">All Modes</option>
            <option value="IMMEDIATE">IMMEDIATE</option>
            <option value="BULK">BULK</option>
          </select>

          <input
            value={emailCategoryFilter}
            onChange={(e) => {
              setEmailPage(1);
              setEmailCategoryFilter(e.target.value);
            }}
            className="border border-[#c4c6d3] px-3 py-2 text-sm"
            placeholder="Category filter (e.g. AUTH_OTP)"
          />

          <select
            value={emailPageSize}
            onChange={(e) => {
              setEmailPage(1);
              setEmailPageSize(Number(e.target.value));
            }}
            className="border border-[#c4c6d3] px-3 py-2 text-sm"
          >
            <option value={10}>10 / page</option>
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
          </select>
        </div>

        {loadingEmailSnapshot ? (
          <p className="border border-dashed border-[#c4c6d3] bg-[#faf9f5] p-4 text-sm text-[#434651]">Loading email queue...</p>
        ) : !emailSnapshot || emailSnapshot.items.length === 0 ? (
          <p className="border border-dashed border-[#c4c6d3] bg-[#faf9f5] p-4 text-sm text-[#434651]">No email activity found for the selected filters.</p>
        ) : (
          <>
            <div className="overflow-x-auto border border-[#c4c6d3]">
              <table className="w-full text-sm bg-white">
                <thead className="bg-[#f5f4f0] text-[#434651] uppercase text-xs tracking-wider">
                  <tr>
                    <th className="text-left px-3 py-2">ID</th>
                    <th className="text-left px-3 py-2">Recipient</th>
                    <th className="text-left px-3 py-2">Category</th>
                    <th className="text-left px-3 py-2">Mode</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Attempts</th>
                    <th className="text-left px-3 py-2">Created</th>
                    <th className="text-left px-3 py-2">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {emailSnapshot.items.map((item) => (
                    <tr key={item.id} className="border-t border-[#e3e2df] align-top">
                      <td className="px-3 py-2">#{item.id}</td>
                      <td className="px-3 py-2 break-all">{item.toEmail}<div className="text-[11px] text-[#747782] mt-1 line-clamp-2">{item.subject}</div></td>
                      <td className="px-3 py-2">{item.category}</td>
                      <td className="px-3 py-2">{item.mode}</td>
                      <td className="px-3 py-2">{item.status}</td>
                      <td className="px-3 py-2">{item.attempts}/{item.maxAttempts}</td>
                      <td className="px-3 py-2 text-xs">{new Date(item.createdAt).toLocaleString()}</td>
                      <td className="px-3 py-2 text-xs text-[#ba1a1a] max-w-[260px] break-words">{item.lastError || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-[#434651]">Total: {emailSnapshot.total} jobs</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEmailPage((p) => Math.max(1, p - 1))}
                  disabled={emailPage <= 1 || loadingEmailSnapshot}
                  className="border border-[#c4c6d3] px-3 py-1 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                >
                  Prev
                </button>
                <span className="text-xs text-[#434651]">Page {emailPage}</span>
                <button
                  onClick={() => {
                    const maxPage = Math.max(1, Math.ceil((emailSnapshot.total || 0) / emailPageSize));
                    setEmailPage((p) => Math.min(maxPage, p + 1));
                  }}
                  disabled={loadingEmailSnapshot || emailPage >= Math.max(1, Math.ceil((emailSnapshot.total || 0) / emailPageSize))}
                  className="border border-[#c4c6d3] px-3 py-1 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>
      ) : null}

      {operationsTab === "tickets" ? (
      <section className="mb-10 border border-[#c4c6d3] bg-white p-5">
        <div className="mb-4">
          <h2 className="font-headline text-2xl text-[#002155]">Ticket Verification</h2>
          <p className="text-sm text-[#434651]">Admin-only check-in: facility tickets consume on verify, while hackathon team tickets support per-member attendance marking.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 mb-4">
          <input
            value={ticketIdInput}
            onChange={(e) => setTicketIdInput(e.target.value)}
            className="border border-[#c4c6d3] px-3 py-2 text-sm"
            placeholder="Enter ticket ID or paste QR URL"
          />
          <button
            onClick={() => void handleVerifyTicket()}
            disabled={ticketVerifying}
            className="bg-[#002155] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
          >
            {ticketVerifying ? "Verifying..." : "Verify Ticket"}
          </button>
          <button
            onClick={() => void handleToggleTicketScanner()}
            disabled={ticketVerifying || ticketScannerStarting}
            className="border border-[#002155] text-[#002155] px-4 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
          >
            {ticketScannerOpen ? "Stop Camera" : ticketScannerStarting ? "Starting..." : "Scan from Camera"}
          </button>
        </div>

        {ticketScannerOpen ? (
          <div className="mb-3 border border-[#c4c6d3] bg-[#faf9f5] p-3">
            <p className="text-xs text-[#434651] mb-2">Point camera at the ticket QR code. Verification runs automatically after scan.</p>
            <video ref={scannerVideoRef} className="w-full max-w-md border border-[#c4c6d3] bg-black" autoPlay muted playsInline />
          </div>
        ) : null}

        {ticketScannerError ? (
          <p className="mb-3 border border-amber-300 bg-amber-50 text-amber-800 px-3 py-2 text-sm">{ticketScannerError}</p>
        ) : null}

        {ticketVerifyError ? (
          <p className="mb-3 border border-red-300 bg-red-50 text-red-700 px-3 py-2 text-sm">{ticketVerifyError}</p>
        ) : null}

        {ticketVerifyResult ? (
          <div className="border border-[#c4c6d3] bg-[#faf9f5] p-4">
            <p className="text-xs uppercase tracking-widest text-[#0b6b2e] font-bold mb-3">
              {ticketVerifyResult.mode === "HACKATHON" ? "Team Ticket Loaded" : "Facility Verification Successful"}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm mb-4">
              <p><span className="text-[#747782]">Ticket ID:</span> <span className="text-[#002155] font-semibold">{ticketVerifyResult.ticketId}</span></p>
              <p><span className="text-[#747782]">Status:</span> <span className="text-[#002155] font-semibold">{ticketVerifyResult.status}</span></p>
              <p><span className="text-[#747782]">Ticket Type:</span> <span className="text-[#002155] font-semibold">{ticketVerifyResult.title}</span></p>
              <p><span className="text-[#747782]">Subject:</span> <span className="text-[#002155] font-semibold">{ticketVerifyResult.subjectName}</span></p>
              {ticketVerifyResult.mode === "FACILITY" && ticketVerifyResult.user ? (
                <>
                  <p><span className="text-[#747782]">User:</span> <span className="text-[#002155] font-semibold">{ticketVerifyResult.user.name}</span></p>
                  <p><span className="text-[#747782]">Email:</span> <span className="text-[#002155] font-semibold">{ticketVerifyResult.user.email}</span></p>
                  <p className="md:col-span-2"><span className="text-[#747782]">Used At:</span> <span className="text-[#002155] font-semibold">{ticketVerifyResult.usedAt ? new Date(ticketVerifyResult.usedAt).toLocaleString() : "N/A"}</span></p>
                </>
              ) : null}
            </div>

            {ticketVerifyResult.mode === "HACKATHON" ? (
              <div className="border border-[#d8d6cf] bg-white p-4">
                <div className="mb-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  <p><span className="text-[#747782]">Team:</span> <span className="text-[#002155] font-semibold">{ticketVerifyResult.teamName || "N/A"}</span></p>
                  <p><span className="text-[#747782]">Event:</span> <span className="text-[#002155] font-semibold">{ticketVerifyResult.eventName || "N/A"}</span></p>
                  <p className="md:col-span-2"><span className="text-[#747782]">Attendance:</span> <span className="text-[#002155] font-semibold">{ticketVerifyResult.presentCount ?? 0}/{ticketVerifyResult.totalMembers ?? 0} present</span></p>
                </div>

                <div className="space-y-2 mb-3">
                  {(ticketVerifyResult.members || []).map((member) => {
                    const alreadyPresent = member.attendanceStatus === "PRESENT";
                    return (
                      <label key={`member-attendance-${member.claimMemberId}`} className={`flex items-start gap-3 border px-3 py-2 ${alreadyPresent ? "border-green-200 bg-green-50" : "border-[#e3e2df] bg-[#faf9f5]"}`}>
                        <input
                          type="checkbox"
                          disabled={alreadyPresent || ticketVerifying}
                          checked={alreadyPresent || selectedPresentMemberIds.includes(member.claimMemberId)}
                          onChange={() => handleTogglePresentSelection(member.claimMemberId)}
                          className="mt-1"
                        />
                        <div className="text-sm">
                          <p className="font-semibold text-[#002155]">{member.name}</p>
                          <p className="text-xs text-[#434651]">{member.email} • UID: {member.uid || "N/A"} • {member.role}</p>
                          <p className={`text-xs mt-1 ${alreadyPresent ? "text-[#0b6b2e]" : "text-[#8c4f00]"}`}>
                            {alreadyPresent
                              ? `PRESENT${member.checkedInAt ? ` at ${new Date(member.checkedInAt).toLocaleString()}` : ""}`
                              : "NOT PRESENT"}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => void handleMarkSelectedMembersPresent()}
                    disabled={ticketVerifying || selectedPresentMemberIds.length === 0}
                    className="bg-[#002155] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
                  >
                    {ticketVerifying ? "Saving..." : "Mark Selected Present"}
                  </button>
                  <button
                    onClick={() => setSelectedPresentMemberIds([])}
                    disabled={ticketVerifying || selectedPresentMemberIds.length === 0}
                    className="border border-[#c4c6d3] text-[#434651] px-4 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
                  >
                    Clear Selection
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
      ) : null}

      {operationsTab === "content" ? (
      <section className="mb-10 grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="border border-[#c4c6d3] bg-white p-5">
          <h2 className="font-headline text-2xl text-[#002155] mb-4">Homepage Hero Upload</h2>
          <p className="text-sm text-[#434651] mb-4">
            Upload slides for the home hero carousel (title, caption, image).
          </p>

          <form className="space-y-4" onSubmit={handleHeroUpload}>
            <div>
              <label className="block text-xs uppercase tracking-widest text-[#434651] font-label mb-2">Title</label>
              <input
                value={heroTitle}
                onChange={(e) => setHeroTitle(e.target.value)}
                required
                className="w-full border border-[#c4c6d3] px-3 py-2 text-sm"
                placeholder="Slide title"
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-widest text-[#434651] font-label mb-2">Caption</label>
              <textarea
                value={heroCaption}
                onChange={(e) => setHeroCaption(e.target.value)}
                required
                className="w-full border border-[#c4c6d3] px-3 py-2 text-sm min-h-[100px]"
                placeholder="Slide caption"
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-widest text-[#434651] font-label mb-2">Image</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                required
                onChange={(e) => setHeroImage(e.target.files?.[0] ?? null)}
                className="w-full text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={heroUploading}
              className="bg-[#002155] text-white px-5 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
            >
              {heroUploading ? "Uploading..." : "Upload Hero Slide"}
            </button>
          </form>
        </div>

        <div className="border border-[#c4c6d3] bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-headline text-2xl text-[#002155]">Recent Hero Slides</h2>
            <span className="text-xs uppercase tracking-widest text-[#434651] font-label">{heroSlides.length} total</span>
          </div>

          {heroSlides.length === 0 ? (
            <p className="text-sm text-[#434651] border border-dashed border-[#c4c6d3] p-4">
              No hero slides uploaded yet.
            </p>
          ) : (
            <div className="space-y-3">
              {heroSlides.slice(0, 5).map((slide) => (
                <article key={slide.id} className="border border-[#e3e2df] p-3 bg-[#faf9f5]">
                  <p className="text-sm font-bold text-[#002155]">{slide.title}</p>
                  <p className="text-xs text-[#434651] mt-1 line-clamp-2">{slide.caption}</p>
                  <p className="text-[10px] uppercase tracking-widest text-[#747782] mt-2">
                    {new Date(slide.createdAt).toLocaleString()}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      ) : null}

      {operationsTab === "bookings" ? (
      <>

      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headline text-2xl text-[#002155]">Upcoming Confirmed Bookings</h2>
          <span className="text-xs uppercase tracking-widest text-[#434651] font-label">
            {prepBookings.length} upcoming
          </span>
        </div>

        {prepBookings.length === 0 ? (
          <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">No upcoming confirmed bookings.</p>
        ) : (
          <div className="space-y-4">
            {prepBookings.map((booking) => (
              <article key={booking.id} className="border border-[#c4c6d3] bg-white p-5">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-[#002155]">
                      #{booking.id} • {booking.lab} • {new Date(booking.date).toLocaleDateString()} • {booking.timeSlot}
                    </p>
                    <p className="mt-1 text-xs text-[#434651]">
                      Student: {booking.student.name} ({booking.student.email})
                    </p>
                    <p className="mt-1 text-xs text-[#434651]">UID: {booking.student.uid || "Not provided"}</p>
                    <p className="mt-1 text-xs text-[#434651]">
                      Ticket: {booking.ticket?.ticketId || "Not issued yet"}
                      {booking.ticket ? ` (${booking.ticket.status})` : ""}
                    </p>
                    <p className="mt-1 text-sm text-[#434651]">{booking.purpose}</p>
                    {booking.facilities?.length ? (
                      <p className="mt-1 text-xs text-[#434651]">Preparation checklist: {booking.facilities.join(", ")}</p>
                    ) : (
                      <p className="mt-1 text-xs text-[#434651]">Preparation checklist: No extra facilities requested.</p>
                    )}
                  </div>
                  <div className="text-xs font-bold uppercase tracking-wider text-green-700 border border-green-200 bg-green-50 px-3 py-2 h-fit">
                    Confirmed
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headline text-2xl text-[#002155]">Attendance for Completed Bookings</h2>
          <span className="text-xs uppercase tracking-widest text-[#434651] font-label">
            {completedConfirmedBookings.length} completed
          </span>
        </div>

        {completedConfirmedBookings.length === 0 ? (
          <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">No completed confirmed bookings yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div className="border border-[#c4c6d3] bg-white p-4">
                <p className="text-xs uppercase tracking-widest text-[#434651] font-label">Completed</p>
                <p className="mt-2 text-2xl font-bold text-[#002155]">{completedConfirmedBookings.length}</p>
              </div>
              <div className="border border-green-200 bg-green-50 p-4">
                <p className="text-xs uppercase tracking-widest text-[#0b6b2e] font-label">Came</p>
                <p className="mt-2 text-2xl font-bold text-[#0b6b2e]">{attendedCompletedBookings.length}</p>
              </div>
              <div className="border border-red-200 bg-red-50 p-4">
                <p className="text-xs uppercase tracking-widest text-[#ba1a1a] font-label">Did Not Come</p>
                <p className="mt-2 text-2xl font-bold text-[#ba1a1a]">{unattendedCompletedBookings.length}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="border border-[#c4c6d3] bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-headline text-xl text-[#002155]">Came (Attendance Marked)</h3>
                  <span className="text-xs uppercase tracking-widest text-[#0b6b2e] font-label">{attendedCompletedBookings.length}</span>
                </div>

                {attendedCompletedBookings.length === 0 ? (
                  <p className="border border-dashed border-[#c4c6d3] bg-[#faf9f5] p-4 text-sm text-[#434651]">No completed booking has been checked in yet.</p>
                ) : (
                  <div className="space-y-3">
                    {attendedCompletedBookings.map((booking) => (
                      <article key={`attended-booking-${booking.id}`} className="border border-green-200 bg-green-50 p-3">
                        <p className="text-sm font-bold text-[#002155]">
                          #{booking.id} • {booking.lab} • {new Date(booking.date).toLocaleDateString()} • {booking.timeSlot}
                        </p>
                        <p className="mt-1 text-xs text-[#434651]">Student: {booking.student.name} ({booking.student.email})</p>
                        <p className="mt-1 text-xs text-[#434651]">UID: {booking.student.uid || "Not provided"}</p>
                        <p className="mt-1 text-xs text-[#434651]">Ticket: {booking.ticket?.ticketId || "N/A"}</p>
                        <p className="mt-1 text-xs font-semibold text-[#0b6b2e]">
                          Came at: {booking.ticket?.usedAt ? new Date(booking.ticket.usedAt).toLocaleString() : "N/A"}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-[#c4c6d3] bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-headline text-xl text-[#002155]">Did Not Come</h3>
                  <span className="text-xs uppercase tracking-widest text-[#ba1a1a] font-label">{unattendedCompletedBookings.length}</span>
                </div>

                {unattendedCompletedBookings.length === 0 ? (
                  <p className="border border-dashed border-[#c4c6d3] bg-[#faf9f5] p-4 text-sm text-[#434651]">Everyone from completed bookings has attendance marked.</p>
                ) : (
                  <div className="space-y-3">
                    {unattendedCompletedBookings.map((booking) => (
                      <article key={`absent-booking-${booking.id}`} className="border border-red-200 bg-red-50 p-3">
                        <p className="text-sm font-bold text-[#002155]">
                          #{booking.id} • {booking.lab} • {new Date(booking.date).toLocaleDateString()} • {booking.timeSlot}
                        </p>
                        <p className="mt-1 text-xs text-[#434651]">Student: {booking.student.name} ({booking.student.email})</p>
                        <p className="mt-1 text-xs text-[#434651]">UID: {booking.student.uid || "Not provided"}</p>
                        <p className="mt-1 text-xs text-[#434651]">Ticket: {booking.ticket?.ticketId || "N/A"}</p>
                        <p className="mt-1 text-xs font-semibold text-[#ba1a1a]">Attendance: NOT MARKED (did not come)</p>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headline text-2xl text-[#002155]">Pending Bookings</h2>
          <span className="text-xs uppercase tracking-widest text-[#434651] font-label">
            {pendingBookings.length} requests
          </span>
        </div>

        {pendingBookings.length === 0 ? (
          <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">No pending bookings.</p>
        ) : (
          <div className="space-y-4">
            {pendingBookings.map((booking) => (
              <article key={booking.id} className="border border-[#c4c6d3] bg-white p-5">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-[#002155]">
                      #{booking.id} • {booking.lab} • {new Date(booking.date).toLocaleDateString()} • {booking.timeSlot}
                    </p>
                    <p className="mt-1 text-sm text-[#434651]">{booking.purpose}</p>
                    <p className="mt-2 text-xs text-[#434651]">
                      Student: {booking.student.name} ({booking.student.email})
                    </p>
                    <p className="mt-1 text-xs text-[#434651]">UID: {booking.student.uid || "Not provided"}</p>
                    {booking.facilities?.length ? (
                      <p className="mt-1 text-xs text-[#434651]">
                        Facilities: {booking.facilities.join(", ")}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleConfirmBooking(booking.id)}
                      disabled={busyBookingId === booking.id}
                      className="bg-[#002155] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider disabled:bg-opacity-50"
                    >
                      {busyBookingId === booking.id ? "Working..." : "Confirm"}
                    </button>
                    <button
                      onClick={() => handleRejectBooking(booking.id)}
                      disabled={busyBookingId === booking.id}
                      className="border border-[#ba1a1a] text-[#ba1a1a] px-4 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      </>

      ) : null}

      {operationsTab === "faculty" ? (
      <>

      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headline text-2xl text-[#002155]">Pending Faculty Approvals</h2>
          <span className="text-xs uppercase tracking-widest text-[#434651] font-label">
            {pendingFaculty.length} pending
          </span>
        </div>

        {pendingFaculty.length === 0 ? (
          <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">No pending faculty approvals.</p>
        ) : (
          <div className="space-y-4">
            {pendingFaculty.map((faculty) => (
              <article key={faculty.id} className="border border-[#c4c6d3] bg-white p-5">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-[#002155]">
                      #{faculty.id} • {faculty.name}
                    </p>
                    <p className="mt-1 text-xs text-[#434651]">{faculty.email}</p>
                    {faculty.phone ? <p className="text-xs text-[#434651]">{faculty.phone}</p> : null}
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleApproveFaculty(faculty.id)}
                      disabled={busyFacultyId === faculty.id}
                      className="bg-[#002155] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider disabled:bg-opacity-50"
                    >
                      {busyFacultyId === faculty.id ? "Working..." : "Approve"}
                    </button>
                    <button
                      onClick={() => handleRejectFaculty(faculty.id)}
                      disabled={busyFacultyId === faculty.id}
                      className="border border-[#ba1a1a] text-[#ba1a1a] px-4 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headline text-2xl text-[#002155]">Recent Users</h2>
          <span className="text-xs uppercase tracking-widest text-[#434651] font-label">{users.length} total</span>
        </div>

        <div className="overflow-x-auto border border-[#c4c6d3] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#f5f4f0] text-[#434651] uppercase text-xs tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Role</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Verified</th>
              </tr>
            </thead>
            <tbody>
              {recentUsers.map((user) => (
                <tr key={user.id} className="border-t border-[#e3e2df]">
                  <td className="px-4 py-3">{user.name}</td>
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">{user.role}</td>
                  <td className="px-4 py-3">{user.status}</td>
                  <td className="px-4 py-3">{user.isVerified ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      </>

      ) : null}

      </>
      ) : null}

      {activeView === "innovation" ? (
        <section className="space-y-8">
          <section className="flex flex-wrap gap-3">
            <Link href="/innovation" className="bg-[#002155] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider">
              Innovation Home
            </Link>
            <Link href="/innovation/faculty" className="border border-[#002155] text-[#002155] px-4 py-2 text-xs font-bold uppercase tracking-wider">
              Faculty Review Workspace
            </Link>
          </section>

          <section className="border border-[#c4c6d3] bg-white p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-headline text-2xl text-[#002155]">Create Hackathon Event</h2>
              <span className="text-xs uppercase tracking-widest text-[#434651] font-label">Admin control</span>
            </div>

            <form className="space-y-4" onSubmit={handleCreateHackathonEvent}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  required
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  className="border border-[#c4c6d3] px-3 py-2 text-sm"
                  placeholder="Hackathon title"
                />
                <input
                  type="file"
                  accept=".ppt,.pptx,.pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf"
                  onChange={(e) => setEventPptFile(e.target.files?.[0] ?? null)}
                  className="border border-[#c4c6d3] px-3 py-2 text-sm"
                />
              </div>

              <textarea
                value={eventDescription}
                onChange={(e) => setEventDescription(e.target.value)}
                className="w-full border border-[#c4c6d3] px-3 py-2 text-sm min-h-[90px]"
                placeholder="Event description (optional)"
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-widest text-[#434651] mb-2">Start Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={eventStartTime}
                    onChange={(e) => setEventStartTime(e.target.value)}
                    className="w-full border border-[#c4c6d3] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-[#434651] mb-2">End Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={eventEndTime}
                    onChange={(e) => setEventEndTime(e.target.value)}
                    className="w-full border border-[#c4c6d3] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-[#434651] mb-2">Submission Lock</label>
                  <input
                    type="datetime-local"
                    required
                    value={eventSubmissionLockAt}
                    onChange={(e) => setEventSubmissionLockAt(e.target.value)}
                    className="w-full border border-[#c4c6d3] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="border border-[#e3e2df] p-4 bg-[#faf9f5] space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-[#002155]">Problem Statements</p>
                  <button
                    type="button"
                    onClick={addEventProblemInput}
                    className="border border-[#002155] text-[#002155] px-3 py-1 text-xs font-bold uppercase tracking-wider"
                  >
                    Add Problem
                  </button>
                </div>

                {eventProblems.map((problem, idx) => (
                  <div key={`event-problem-${idx}`} className="border border-[#d8d6cf] bg-white p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs uppercase tracking-widest text-[#434651]">Problem #{idx + 1}</p>
                      <button
                        type="button"
                        onClick={() => removeEventProblemInput(idx)}
                        disabled={eventProblems.length <= 1}
                        className="text-xs font-bold uppercase tracking-wider text-[#ba1a1a] disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>

                    <input
                      required
                      value={problem.title}
                      onChange={(e) => updateEventProblem(idx, { title: e.target.value })}
                      className="w-full border border-[#c4c6d3] px-3 py-2 text-sm"
                      placeholder="Problem title"
                    />
                    <textarea
                      required
                      value={problem.description}
                      onChange={(e) => updateEventProblem(idx, { description: e.target.value })}
                      className="w-full border border-[#c4c6d3] px-3 py-2 text-sm min-h-[80px]"
                      placeholder="Problem description"
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <label className="flex items-center gap-2 text-sm text-[#434651]">
                        <input
                          type="checkbox"
                          checked={problem.isIndustryProblem}
                          onChange={(e) => updateEventProblem(idx, { isIndustryProblem: e.target.checked, industryName: e.target.checked ? problem.industryName : "" })}
                        />
                        Industry Problem
                      </label>
                      {problem.isIndustryProblem ? (
                        <input
                          required
                          value={problem.industryName}
                          onChange={(e) => updateEventProblem(idx, { industryName: e.target.value })}
                          className="w-full border border-[#c4c6d3] px-3 py-2 text-sm"
                          placeholder="Industry name"
                        />
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="submit"
                disabled={eventCreating}
                className="bg-[#002155] text-white px-5 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
              >
                {eventCreating ? "Creating..." : "Create Hackathon Event"}
              </button>
            </form>
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-headline text-2xl text-[#002155]">Pending Innovation Submissions</h2>
              <span className="text-xs uppercase tracking-widest text-[#434651] font-label">
                {innovationSubmissions.length} submitted
              </span>
            </div>

            {innovationSubmissions.length === 0 ? (
              <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">No submitted innovation claims.</p>
            ) : (
              <div className="space-y-3">
                {innovationSubmissions.map((submission) => (
                  <article key={submission.id} className="border border-[#c4c6d3] bg-white p-5">
                    <p className="text-sm font-bold text-[#002155]">Claim #{submission.id} • {submission.problem.title}</p>
                    <p className="mt-1 text-xs text-[#434651]">Team: {submission.teamName || "Individual"}</p>
                    <p className="mt-1 text-xs text-[#434651]">
                      Event: {submission.problem.event ? submission.problem.event.title : "Continuous Mode"}
                    </p>
                    <p className="mt-1 text-xs text-[#434651]">Updated: {new Date(submission.updatedAt).toLocaleString()}</p>
                    {submission.problem.event ? (
                      <Link
                        href={`/innovation/events/${submission.problem.event.id}`}
                        className="inline-flex mt-3 border border-[#002155] text-[#002155] px-3 py-2 text-xs font-bold uppercase tracking-wider"
                      >
                        View Event Page
                      </Link>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-headline text-2xl text-[#002155]">Innovation Event Status Controls</h2>
              <span className="text-xs uppercase tracking-widest text-[#434651] font-label">
                {innovationEvents.length} events
              </span>
            </div>

            {innovationEvents.length === 0 ? (
              <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">No innovation events found.</p>
            ) : (
              <div className="space-y-3">
                {innovationEvents.map((event) => {
                  const eventInterest = eventInterestById.get(event.id);
                  const totalInterested = eventInterest?.totalInterested ?? event.totalInterested;
                  const totalWithDetails = eventInterest?.totalWithDetails ?? event.totalInterestedWithDetails;

                  return (
                    <article key={event.id} className="border border-[#c4c6d3] bg-white p-5">
                      <p className="text-sm font-bold text-[#002155]">#{event.id} • {event.title}</p>
                      <p className="mt-1 text-xs text-[#434651]">
                        Event: {event.status === "CLOSED" ? "CLOSED" : "OPEN"} ({event.status})
                      </p>
                      <p className="mt-1 text-xs text-[#434651]">Submissions: {event.registrationOpen ? "OPEN" : "CLOSED"}</p>
                      <p className="mt-1 text-xs text-[#434651]">{new Date(event.startTime).toLocaleString()} to {new Date(event.endTime).toLocaleString()}</p>
                      <p className="mt-1 text-xs text-[#434651]">
                        Submission lock: {event.submissionLockAt ? new Date(event.submissionLockAt).toLocaleString() : "Not set"}
                      </p>
                      <p className="mt-1 text-xs text-[#434651]">Interest: {totalInterested} students ({totalWithDetails} with team details)</p>

                      <details className="mt-3 border border-[#e3e2df] bg-[#faf9f5] p-3">
                        <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-[#002155]">
                          Interested Students ({eventInterest?.interestedStudents.length || 0})
                        </summary>
                        {eventInterest?.interestedStudents.length ? (
                          <div className="mt-3 overflow-x-auto border border-[#d8d6cf] bg-white">
                            <table className="w-full text-xs">
                              <thead className="bg-[#f5f4f0] text-[#434651] uppercase tracking-wider">
                                <tr>
                                  <th className="text-left px-3 py-2">Name</th>
                                  <th className="text-left px-3 py-2">UID</th>
                                  <th className="text-left px-3 py-2">Phone</th>
                                  <th className="text-left px-3 py-2">Team Details</th>
                                  <th className="text-left px-3 py-2">Marked At</th>
                                </tr>
                              </thead>
                              <tbody>
                                {eventInterest.interestedStudents.map((entry) => (
                                  <tr key={`interest-student-${event.id}-${entry.id}`} className="border-t border-[#e3e2df]">
                                    <td className="px-3 py-2">
                                      <p className="font-semibold text-[#002155]">{entry.user.name}</p>
                                      <p className="text-[11px] text-[#747782]">{entry.user.email}</p>
                                    </td>
                                    <td className="px-3 py-2">{entry.user.uid || "N/A"}</td>
                                    <td className="px-3 py-2">{entry.user.phone || "N/A"}</td>
                                    <td className="px-3 py-2">
                                      {entry.hasDetails
                                        ? `${entry.teamName || "No team name"} | Size ${entry.teamSize || "N/A"}`
                                        : "Not added"}
                                    </td>
                                    <td className="px-3 py-2">{new Date(entry.createdAt).toLocaleString()}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-[#434651]">No interested students yet.</p>
                        )}
                      </details>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {event.status === "UPCOMING" ? (
                          <button
                            onClick={() => handleInnovationEventStatus(event.id, "ACTIVE")}
                            disabled={busyInnovationEventId === event.id}
                            className="bg-[#002155] text-white px-3 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
                          >
                            Mark OPEN
                          </button>
                        ) : null}
                        {event.status === "ACTIVE" || event.status === "JUDGING" ? (
                          <button
                            onClick={() => handleInnovationEventStatus(event.id, "CLOSED")}
                            disabled={busyInnovationEventId === event.id}
                            className="bg-[#002155] text-white px-3 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
                          >
                            Mark CLOSED
                          </button>
                        ) : null}

                        <button
                          onClick={() => void handleToggleEventRegistration(event)}
                          disabled={busyInnovationEventId === event.id}
                          className="border border-[#0b6b2e] text-[#0b6b2e] px-3 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
                        >
                          {event.registrationOpen ? "Close Submissions" : "Open Submissions"}
                        </button>

                        <button
                          onClick={() => void handleLoadInnovationLeaderboard(event.id)}
                          className="border border-[#002155] text-[#002155] px-3 py-2 text-xs font-bold uppercase tracking-wider"
                        >
                          Leaderboard
                        </button>
                        <Link
                          href={`/innovation/events/${event.id}`}
                          className="border border-[#8c4f00] text-[#8c4f00] px-3 py-2 text-xs font-bold uppercase tracking-wider"
                        >
                          View Event Page
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <h2 className="font-headline text-2xl text-[#002155]">Hackathon Submissions Control Center</h2>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={managedSubmissionEventFilter}
                  onChange={(e) => setManagedSubmissionEventFilter(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}
                  className="border border-[#c4c6d3] px-3 py-2 text-sm"
                >
                  <option value="ALL">All Events</option>
                  {innovationEvents.map((event) => (
                    <option key={`submission-filter-${event.id}`} value={event.id}>
                      #{event.id} {event.title}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => void refreshManagedSubmissions()}
                  className="border border-[#002155] text-[#002155] px-3 py-2 text-xs font-bold uppercase tracking-wider"
                >
                  Refresh
                </button>
                <button
                  onClick={() => void syncScreeningDecisions()}
                  disabled={syncingStage !== null || stagedScreeningCount === 0 || managedSubmissionEventFilter === "ALL"}
                  className="bg-[#002155] text-white px-3 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
                >
                  {syncingStage === "SCREENING" ? "Syncing..." : "Sync Screening"}
                </button>
                <button
                  onClick={() => void syncJudgingDecisions()}
                  disabled={syncingStage !== null || stagedJudgingCount === 0 || managedSubmissionEventFilter === "ALL"}
                  className="bg-[#0b6b2e] text-white px-3 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
                >
                  {syncingStage === "JUDGING" ? "Syncing..." : "Sync Final Judging"}
                </button>
              </div>
            </div>
            <p className="text-xs text-[#434651] mb-3">
              Staged Screening: {stagedScreeningCount}/{screeningSubmissions.length} | Staged Judging: {stagedJudgingCount}/{judgingSubmissions.length}
            </p>

            {loadingManagedSubmissions ? (
              <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">Loading hackathon submissions...</p>
            ) : filteredManagedSubmissions.length === 0 ? (
              <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">No hackathon submissions found for this filter.</p>
            ) : (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#002155] mb-2">Screening Queue ({screeningSubmissions.length})</h3>
                  {screeningSubmissions.length === 0 ? (
                    <p className="border border-dashed border-[#c4c6d3] bg-white p-4 text-sm text-[#434651]">No teams pending PPT screening.</p>
                  ) : (
                    <div className="space-y-3">
                      {screeningSubmissions.map((claim) => (
                        <article key={`screening-${claim.id}`} className="border border-[#c4c6d3] bg-white p-5">
                          <p className="text-sm font-bold text-[#002155]">Claim #{claim.id} • {claim.problem.title}</p>
                          <p className="mt-1 text-xs text-[#434651]">Team: {claim.teamName || `Team-${claim.id}`}</p>
                          <p className="mt-1 text-xs text-[#434651]">Members: {claim.members.map((member) => member.user.name).join(", ")}</p>
                          <p className="mt-1 text-xs text-[#434651]">Status: {claim.status}</p>
                          <p className="mt-1 text-xs text-[#434651]">Updated: {new Date(claim.updatedAt).toLocaleString()}</p>
                          <div className="mt-2 flex flex-wrap gap-3">
                            {claim.submissionUrl ? (
                              <a href={claim.submissionUrl} target="_blank" rel="noreferrer" className="text-xs font-bold uppercase tracking-wider text-[#8c4f00] underline">
                                Submission URL
                              </a>
                            ) : null}
                            {claim.submissionFileUrl ? (
                              <a href={claim.submissionFileUrl} target="_blank" rel="noreferrer" className="text-xs font-bold uppercase tracking-wider text-[#8c4f00] underline">
                                Submission PPT/PDF
                              </a>
                            ) : null}
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              onClick={() => stageDecision(claim.id, "SHORTLISTED")}
                              disabled={syncingStage !== null}
                              className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border disabled:opacity-60 ${
                                stagedDecisions[claim.id] === "SHORTLISTED"
                                  ? "bg-[#002155] text-white border-[#002155]"
                                  : "bg-white text-[#002155] border-[#002155]"
                              }`}
                            >
                              Shortlist
                            </button>
                            <button
                              onClick={() => stageDecision(claim.id, "REJECTED")}
                              disabled={syncingStage !== null}
                              className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border disabled:opacity-60 ${
                                stagedDecisions[claim.id] === "REJECTED"
                                  ? "bg-[#ba1a1a] text-white border-[#ba1a1a]"
                                  : "bg-white text-[#ba1a1a] border-[#ba1a1a]"
                              }`}
                            >
                              Reject
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-[#434651]">
                            Current staged decision: <span className="font-bold">{stagedDecisions[claim.id] || "Not marked"}</span>
                          </p>
                        </article>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#002155] mb-2">Judging Queue ({judgingSubmissions.length})</h3>
                  {judgingSubmissions.length === 0 ? (
                    <p className="border border-dashed border-[#c4c6d3] bg-white p-4 text-sm text-[#434651]">No shortlisted teams waiting for judging.</p>
                  ) : (
                    <div className="space-y-3">
                      {judgingSubmissions.map((claim) => {
                        const rubricDraft = getJudgingRubrics(claim);
                        const teamLeader = claim.members.find((member) => member.role === "LEAD") ?? claim.members[0] ?? null;
                        const teamLeaderPhone = teamLeader?.user.phone?.trim() || "Not available";

                        return (
                          <article key={`judging-${claim.id}`} className="border border-[#c4c6d3] bg-white p-5">
                            <p className="text-sm font-bold text-[#002155]">Claim #{claim.id} • {claim.problem.title}</p>
                            <p className="mt-1 text-xs text-[#434651]">Team: {claim.teamName || `Team-${claim.id}`}</p>
                            <p className="mt-1 text-xs text-[#434651]">
                              Team Leader: {teamLeader ? `${teamLeader.user.name} (${teamLeader.user.email})` : "Unknown"} • Contact: {teamLeaderPhone}
                            </p>
                            <p className="mt-1 text-xs text-[#434651]">Members: {claim.members.map((member) => member.user.name).join(", ")}</p>
                            <p className="mt-1 text-xs text-[#434651]">Attendance: {claim.attendanceSummary.presentCount}/{claim.attendanceSummary.totalMembers} present</p>
                            <p className="mt-1 text-xs text-[#434651]">Updated: {new Date(claim.updatedAt).toLocaleString()}</p>
                            <div className="mt-2 flex flex-wrap gap-3">
                              {claim.submissionUrl ? (
                                <a href={claim.submissionUrl} target="_blank" rel="noreferrer" className="text-xs font-bold uppercase tracking-wider text-[#8c4f00] underline">
                                  Submission URL
                                </a>
                              ) : null}
                              {claim.submissionFileUrl ? (
                                <a href={claim.submissionFileUrl} target="_blank" rel="noreferrer" className="text-xs font-bold uppercase tracking-wider text-[#8c4f00] underline">
                                  Submission PPT/PDF
                                </a>
                              ) : null}
                            </div>

                            <div className="mt-3 border border-[#e3e2df] bg-[#faf9f5] p-4">
                              <p className="text-xs font-bold uppercase tracking-wider text-[#434651] mb-3">Rubrics (0-10)</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                {rubricFieldConfig.map((field) => (
                                  <label key={`rubric-${claim.id}-${field.key}`} className="text-xs text-[#434651]">
                                    {field.label} ({field.weight}%)
                                    <input
                                      type="number"
                                      min={0}
                                      max={10}
                                      step={1}
                                      value={rubricDraft[field.key]}
                                      onChange={(e) => updateJudgingRubric(claim.id, field.key, Number(e.target.value))}
                                      className="mt-1 w-full border border-[#c4c6d3] px-2 py-2 text-sm"
                                    />
                                  </label>
                                ))}
                              </div>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                onClick={() => stageDecision(claim.id, "ACCEPTED")}
                                disabled={syncingStage !== null}
                                className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border disabled:opacity-60 ${
                                  stagedDecisions[claim.id] === "ACCEPTED"
                                    ? "bg-[#0b6b2e] text-white border-[#0b6b2e]"
                                    : "bg-white text-[#0b6b2e] border-[#0b6b2e]"
                                }`}
                              >
                                Final Select
                              </button>
                              <button
                                onClick={() => stageDecision(claim.id, "REJECTED")}
                                disabled={syncingStage !== null}
                                className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border disabled:opacity-60 ${
                                  stagedDecisions[claim.id] === "REJECTED"
                                    ? "bg-[#ba1a1a] text-white border-[#ba1a1a]"
                                    : "bg-white text-[#ba1a1a] border-[#ba1a1a]"
                                }`}
                              >
                                Final Reject
                              </button>
                            </div>
                            <p className="mt-2 text-xs text-[#434651]">
                              Current staged decision: <span className="font-bold">{stagedDecisions[claim.id] || "Not marked"}</span>
                            </p>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#002155] mb-2">Finalized Teams ({finalizedSubmissions.length})</h3>
                  {finalizedSubmissions.length === 0 ? (
                    <p className="border border-dashed border-[#c4c6d3] bg-white p-4 text-sm text-[#434651]">No finalized judging decisions yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {finalizedSubmissions.map((claim) => (
                        <article key={`finalized-${claim.id}`} className="border border-[#c4c6d3] bg-white p-5">
                          <p className="text-sm font-bold text-[#002155]">Claim #{claim.id} • {claim.problem.title}</p>
                          <p className="mt-1 text-xs text-[#434651]">Team: {claim.teamName || `Team-${claim.id}`}</p>
                          <p className="mt-1 text-xs text-[#434651]">Status: {claim.status}</p>
                          <p className="mt-1 text-xs text-[#434651]">Final Score: {claim.finalScore ?? "N/A"}</p>
                          {claim.teamTicket ? (
                            <p className="mt-1 text-xs text-[#434651]">Team Ticket: {claim.teamTicket.ticketId} ({claim.teamTicket.status})</p>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-headline text-2xl text-[#002155]">Leaderboard Overview</h2>
              <span className="text-xs uppercase tracking-widest text-[#434651] font-label">
                {selectedInnovationEventId ? `event #${selectedInnovationEventId}` : "select event"}
              </span>
            </div>

            {loadingInnovationLeaderboard ? (
              <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">Loading leaderboard...</p>
            ) : innovationLeaderboard.length === 0 ? (
              <p className="border border-dashed border-[#c4c6d3] bg-white p-6 text-[#434651]">No leaderboard rows loaded yet.</p>
            ) : (
              <div className="overflow-x-auto border border-[#c4c6d3] bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-[#f5f4f0] text-[#434651] uppercase text-xs tracking-wider">
                    <tr>
                      <th className="text-left px-4 py-3">Rank</th>
                      <th className="text-left px-4 py-3">Team</th>
                      <th className="text-left px-4 py-3">Score</th>
                      <th className="text-left px-4 py-3">Members</th>
                    </tr>
                  </thead>
                  <tbody>
                    {innovationLeaderboard.map((row) => (
                      <tr key={`${row.rank}-${row.teamName}`} className="border-t border-[#e3e2df]">
                        <td className="px-4 py-3">#{row.rank}</td>
                        <td className="px-4 py-3">{row.teamName}</td>
                        <td className="px-4 py-3">{row.score}</td>
                        <td className="px-4 py-3">{row.members.map((m) => m.name).join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>
      ) : null}
    </main>
  );
}
