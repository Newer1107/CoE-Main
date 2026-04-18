"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type AdminUserDetail = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  uid: string | null;
  isVerified: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  industry: {
    id: number;
    name: string;
  } | null;
  studentProfile: {
    id: number;
    skills: string | null;
    experience: string | null;
    interests: string | null;
    resumeUrl: string | null;
    resumeFileName: string | null;
    resumeDownloadUrl: string | null;
    isComplete: boolean;
    updatedAt: string;
  } | null;
  bookings: Array<{
    id: number;
    purpose: string;
    date: string;
    timeSlot: string;
    lab: string;
    status: string;
    createdAt: string;
  }>;
  applications: Array<{
    id: number;
    status: string;
    createdAt: string;
    updatedAt: string;
    problem: {
      id: number;
      title: string;
    };
  }>;
  tickets: Array<{
    id: number;
    ticketId: string;
    type: string;
    status: string;
    title: string;
    subjectName: string;
    scheduledAt: string | null;
    issuedAt: string;
    usedAt: string | null;
    cancelledAt: string | null;
  }>;
  problemsAuthored: Array<{
    id: number;
    title: string;
    mode: string;
    status: string;
    createdAt: string;
  }>;
  claimMemberships: Array<{
    id: number;
    role: string;
    claim: {
      id: number;
      teamName: string | null;
      status: string;
      updatedAt: string;
      problem: {
        id: number;
        title: string;
      };
    };
  }>;
  _count: {
    bookings: number;
    applications: number;
    tickets: number;
    problemsAuthored: number;
    problemsCreated: number;
  };
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
  totalSessions: number;
  sessionUploadLocks?: Array<{
    session: number;
    isOpen: boolean;
    updatedAt: string;
  }>;
  totalInterested: number;
  totalInterestedWithDetails: number;
  pptFileUrl?: string | null;
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

const clampRubricScore = (value: number, max: number) => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > max) return max;
  return Math.round(value);
};

const getRubricTotalScore = (rubrics: HackathonRubrics) => {
  return rubricFieldConfig.reduce((sum, field) => sum + rubrics[field.key], 0);
};

type EventProblemInput = {
  title: string;
  description: string;
  isIndustryProblem: boolean;
  industryName: string;
  supportDocumentFile: File | null;
};

type EventProblemRow = {
  id?: number;
  title: string;
  description: string;
  isIndustryProblem: boolean;
  industryName: string;
  supportDocumentUrl: string | null;
  supportDocumentFile: File | null;
  removeSupportDocument: boolean;
};

type EventEditDraft = {
  eventId: number;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  totalSessions: number;
  registrationOpen: boolean;
  status: InnovationEvent["status"];
  pptFile: File | null;
  removePptFile: boolean;
  problems: EventProblemRow[];
  deletedProblemIds: number[];
};

type InnovationLeaderboardRow = {
  rank: number;
  teamName: string;
  score: number;
  members: { id: number; name: string; email: string; role: string }[];
};

type InnovationStatus = ManagedHackathonSubmission["status"];

type InnovationTab = "events" | "review" | "leaderboard" | "analytics";
type InnovationAnalyticsTab = "participants" | "teams" | "attendance" | "insights";

type AnalyticsStage = "SCREENING" | "JUDGING" | "CLOSED";
type AnalyticsStageFilter = "ALL" | AnalyticsStage;
type AnalyticsStatusFilter = "ALL" | "IN_PROGRESS" | "SUBMITTED" | "SHORTLISTED" | "ACCEPTED" | "REVISION_REQUESTED" | "REJECTED";

type ParticipantAnalyticsRow = {
  id: number;
  teamId: number;
  teamName: string;
  teamIdentifier: string;
  memberName: string;
  role: "Leader" | "Member";
  email: string;
  phone: string | null;
  uid: string | null;
  problemId: number;
  problemStatement: string;
  eventId: number | null;
  eventName: string;
  submissionStatus: InnovationStatus;
  stage: AnalyticsStage;
  finalScore: number | null;
  updatedAt: string;
};

type ParticipantAnalyticsData = {
  items: ParticipantAnalyticsRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    totalParticipants: number;
    totalTeams: number;
    averageScore: number | null;
  };
  options: {
    events: Array<{ id: number; title: string; status: InnovationEvent["status"]; totalSessions: number }>;
    problems: Array<{ id: number; title: string; eventId: number | null }>;
    teams: Array<{ id: number; name: string; problemId: number; eventId: number | null }>;
  };
};

type TeamAnalyticsData = {
  summary: {
    totalTeamsRegistered: number;
    shortlistedTeamsCount: number;
    acceptedTeamsCount: number;
    rejectedTeamsCount: number;
    averageTeamScore: number | null;
  };
  acceptedVsRejected: {
    accepted: number;
    rejected: number;
  };
  teamsPerProblem: Array<{
    problemId: number;
    problemTitle: string;
    count: number;
    eventId: number | null;
  }>;
  leaderboard: Array<{
    rank: number;
    teamId: number;
    teamName: string;
    score: number;
    status: InnovationStatus;
    problemTitle: string;
    eventTitle: string;
  }>;
  teams: {
    items: Array<{
      teamId: number;
      teamName: string;
      status: InnovationStatus;
      stage: AnalyticsStage;
      finalScore: number | null;
      updatedAt: string;
      problemId: number;
      problemTitle: string;
      eventId: number | null;
      eventTitle: string;
      session: number;
      totalSessions: number;
      memberCount: number;
      members: Array<{
        claimMemberId: number;
        userId: number;
        name: string;
        email: string;
        uid: string | null;
        phone: string | null;
        role: string;
      }>;
      attendance: {
        presentCount: number;
        totalMembers: number;
        attendancePercentage: number;
      };
      perSessionSummary: Array<{
        session: number;
        presentCount: number;
        totalMembers: number;
        attendancePercentage: number;
      }>;
      ticket: {
        id: number;
        ticketId: string;
        status: "ACTIVE" | "USED" | "CANCELLED";
      } | null;
    }>;
    total: number;
    page: number;
    pageSize: number;
  };
  selectedSession: number;
};

type AttendanceAnalyticsData = {
  items: Array<{
    teamId: number;
    teamName: string;
    submissionStatus: InnovationStatus;
    stage: AnalyticsStage;
    updatedAt: string;
    problemId: number;
    problemTitle: string;
    eventId: number | null;
    eventTitle: string;
    session: number;
    totalSessions: number;
    ticket: {
      id: number;
      ticketId: string;
      status: "ACTIVE" | "USED" | "CANCELLED";
    } | null;
    attendance: {
      presentCount: number;
      totalMembers: number;
      attendancePercentage: number;
    };
    perSessionSummary: Array<{
      session: number;
      presentCount: number;
      totalMembers: number;
      attendancePercentage: number;
    }>;
    members: Array<{
      claimMemberId: number;
      userId: number;
      name: string;
      email: string;
      phone: string | null;
      uid: string | null;
      role: "Leader" | "Member";
      attendanceStatus: "PRESENT" | "NOT_PRESENT";
      markedTime: string | null;
      markedBy: {
        id: number;
        name: string;
        email: string;
      } | null;
    }>;
  }>;
  total: number;
  page: number;
  pageSize: number;
  selectedSession: number;
  summary: {
    totalPresent: number;
    totalMembers: number;
    attendancePercentage: number;
  };
};

type InsightsAnalyticsData = {
  selectedSession: number;
  participationTrends: Array<{ date: string; teams: number }>;
  problemPopularity: Array<{ problemId: number; problemTitle: string; teams: number }>;
  dropOffRate: {
    registered: number;
    submitted: number;
    shortlisted: number;
    accepted: number;
    percentages: {
      submittedFromRegistered: number;
      shortlistedFromRegistered: number;
      acceptedFromRegistered: number;
    };
  };
  averageScoresByProblem: Array<{
    problemId: number;
    problemTitle: string;
    averageScore: number;
    scoredTeams: number;
  }>;
  judgeScoringDistribution: {
    scoreBins: Array<{ range: string; teams: number }>;
    rubricAverages: Array<{ rubric: string; average: number | null; count: number }>;
  };
  attendanceVsPerformance: {
    correlation: number | null;
    sampleSize: number;
    bucketAverages: {
      lowAttendance: { range: string; averageScore: number | null; teams: number };
      mediumAttendance: { range: string; averageScore: number | null; teams: number };
      highAttendance: { range: string; averageScore: number | null; teams: number };
    };
  };
  attendancePerSession: Array<{
    session: number;
    presentCount: number;
    totalMembers: number;
    attendancePercentage: number;
    teamsWithAnyPresent: number;
  }>;
  attendanceConsistency: {
    averageConsistency: number | null;
    teams: Array<{
      teamId: number;
      teamName: string;
      totalSessions: number;
      completedSessions: number;
      consistencyScore: number;
      missingSessions: number[];
    }>;
  };
  teamsMissingSpecificSessions: Array<{
    teamId: number;
    teamName: string;
    missingSessions: number[];
  }>;
  sessionDropOff: Array<{
    fromSession: number;
    toSession: number;
    teamsFrom: number;
    teamsTo: number;
    dropOffCount: number;
    dropOffRate: number;
  }>;
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
  session?: number;
  totalSessions?: number;
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

type IndustryPartnerSummary = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  createdAt: string;
  industry: {
    id: number;
    name: string;
  } | null;
};

type IndustryDirectoryRow = {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  _count: {
    users: number;
    problems: number;
  };
  users: IndustryPartnerSummary[];
};

type OperationsTab = "overview" | "bookings" | "faculty" | "tickets" | "content" | "emails" | "industry";

const apiCall = async (url: string, options?: RequestInit) => {
  const isFormDataBody = options?.body instanceof FormData;

  const res = await fetch(url, {
    ...options,
    headers: {
      ...(isFormDataBody ? {} : { "Content-Type": "application/json" }),
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

const formatIstDateTime = (value: string | null | undefined) => {
  if (!value) return "Not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Invalid date";
  return parsed.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
};

const toDateTimeLocalValue = (value: string | null | undefined) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
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
  const [eventTotalSessions, setEventTotalSessions] = useState(1);
  const [eventPptFile, setEventPptFile] = useState<File | null>(null);
  const [eventCreating, setEventCreating] = useState(false);
  const [eventProblems, setEventProblems] = useState<EventProblemInput[]>([
    {
      title: "",
      description: "",
      isIndustryProblem: false,
      industryName: "",
      supportDocumentFile: null,
    },
  ]);
  const [eventEditDraft, setEventEditDraft] = useState<EventEditDraft | null>(null);
  const [eventEditLoading, setEventEditLoading] = useState(false);
  const [eventEditSaving, setEventEditSaving] = useState(false);
  const [sessionLockMutationKey, setSessionLockMutationKey] = useState<string | null>(null);

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
  const [ticketSession, setTicketSession] = useState(1);
  const [selectedPresentMemberIds, setSelectedPresentMemberIds] = useState<number[]>([]);
  const [ticketScannerOpen, setTicketScannerOpen] = useState(false);
  const [ticketScannerStarting, setTicketScannerStarting] = useState(false);
  const [ticketScannerError, setTicketScannerError] = useState("");
  const [operationsTab, setOperationsTab] = useState<OperationsTab>("overview");
  const [industryPartners, setIndustryPartners] = useState<IndustryPartnerSummary[]>(() =>
    users
      .filter((entry) => entry.role === "INDUSTRY_PARTNER")
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        email: entry.email,
        phone: entry.phone,
        role: entry.role,
        status: entry.status,
        createdAt: entry.createdAt,
          industry: null,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  );
        const [industryDirectory, setIndustryDirectory] = useState<IndustryDirectoryRow[]>([]);
        const [loadingIndustryDirectory, setLoadingIndustryDirectory] = useState(false);
        const [selectedIndustryOption, setSelectedIndustryOption] = useState<string>("NEW");
        const [industryNameInput, setIndustryNameInput] = useState("");
  const [industryPartnerName, setIndustryPartnerName] = useState("");
  const [industryPartnerEmail, setIndustryPartnerEmail] = useState("");
  const [industryPartnerPhone, setIndustryPartnerPhone] = useState("");
  const [industryPartnerPassword, setIndustryPartnerPassword] = useState("");
  const [creatingIndustryPartner, setCreatingIndustryPartner] = useState(false);
  const [innovationTab, setInnovationTab] = useState<InnovationTab>("events");
  const [innovationAnalyticsTab, setInnovationAnalyticsTab] = useState<InnovationAnalyticsTab>("participants");
  const [selectedUserDetailId, setSelectedUserDetailId] = useState<number | null>(null);
  const [selectedUserDetail, setSelectedUserDetail] = useState<AdminUserDetail | null>(null);
  const [loadingUserDetail, setLoadingUserDetail] = useState(false);

  const [analyticsEventFilter, setAnalyticsEventFilter] = useState<number | "ALL">("ALL");
  const [analyticsProblemFilter, setAnalyticsProblemFilter] = useState<number | "ALL">("ALL");
  const [analyticsTeamFilter, setAnalyticsTeamFilter] = useState<number | "ALL">("ALL");
  const [analyticsSessionFilter, setAnalyticsSessionFilter] = useState(1);
  const [analyticsStageFilter, setAnalyticsStageFilter] = useState<AnalyticsStageFilter>("ALL");
  const [analyticsStartDate, setAnalyticsStartDate] = useState("");
  const [analyticsEndDate, setAnalyticsEndDate] = useState("");

  const [participantSearch, setParticipantSearch] = useState("");
  const [participantStatusFilter, setParticipantStatusFilter] = useState<AnalyticsStatusFilter>("ALL");
  const [participantPage, setParticipantPage] = useState(1);
  const [participantPageSize, setParticipantPageSize] = useState(25);
  const [participantData, setParticipantData] = useState<ParticipantAnalyticsData | null>(null);
  const [loadingParticipantData, setLoadingParticipantData] = useState(false);

  const [teamAnalyticsPage, setTeamAnalyticsPage] = useState(1);
  const [teamAnalyticsPageSize, setTeamAnalyticsPageSize] = useState(15);
  const [teamData, setTeamData] = useState<TeamAnalyticsData | null>(null);
  const [loadingTeamData, setLoadingTeamData] = useState(false);
  const [teamManagementClaimId, setTeamManagementClaimId] = useState<number | null>(null);
  const [teamMemberIdentifierInput, setTeamMemberIdentifierInput] = useState("");
  const [teamMemberMutationKey, setTeamMemberMutationKey] = useState<string | null>(null);

  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [attendancePage, setAttendancePage] = useState(1);
  const [attendancePageSize, setAttendancePageSize] = useState(8);
  const [attendanceData, setAttendanceData] = useState<AttendanceAnalyticsData | null>(null);
  const [loadingAttendanceData, setLoadingAttendanceData] = useState(false);
  const [attendanceUpdateKey, setAttendanceUpdateKey] = useState<string | null>(null);

  const [insightsData, setInsightsData] = useState<InsightsAnalyticsData | null>(null);
  const [loadingInsightsData, setLoadingInsightsData] = useState(false);

  const [debouncedParticipantSearch, setDebouncedParticipantSearch] = useState("");
  const [debouncedAttendanceSearch, setDebouncedAttendanceSearch] = useState("");

  const scannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const scannerFrameRef = useRef<number | null>(null);
  const scannerRunningRef = useRef(false);

  const allUsers = useMemo(
    () => [...users].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [users]
  );
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

  const analyticsEventOptions = useMemo(() => {
    if (participantData?.options?.events?.length) return participantData.options.events;
    return innovationEvents.map((event) => ({
      id: event.id,
      title: event.title,
      status: event.status,
      totalSessions: event.totalSessions ?? 1,
    }));
  }, [participantData, innovationEvents]);

  const analyticsSessionLimit = useMemo(() => {
    if (analyticsEventFilter !== "ALL") {
      const selected = analyticsEventOptions.find((event) => event.id === analyticsEventFilter);
      return Math.max(1, selected?.totalSessions ?? 1);
    }

    const maxSessions = analyticsEventOptions.reduce((max, event) => Math.max(max, event.totalSessions || 1), 1);
    return Math.max(1, maxSessions);
  }, [analyticsEventFilter, analyticsEventOptions]);

  const analyticsProblemOptions = useMemo(() => {
    const options = participantData?.options?.problems || [];
    if (analyticsEventFilter === "ALL") return options;
    return options.filter((problem) => problem.eventId === analyticsEventFilter);
  }, [participantData, analyticsEventFilter]);

  const analyticsTeamOptions = useMemo(() => {
    const options = participantData?.options?.teams || [];
    return options.filter((team) => {
      if (analyticsEventFilter !== "ALL" && team.eventId !== analyticsEventFilter) return false;
      if (analyticsProblemFilter !== "ALL" && team.problemId !== analyticsProblemFilter) return false;
      return true;
    });
  }, [participantData, analyticsEventFilter, analyticsProblemFilter]);

  const allSessionAttendanceSummary = useMemo(() => {
    if (!attendanceData?.items?.length) return null;

    let totalPresent = 0;
    let totalSlots = 0;

    for (const team of attendanceData.items) {
      for (const row of team.perSessionSummary) {
        totalPresent += row.presentCount;
        totalSlots += row.totalMembers;
      }
    }

    const attendancePercentage = totalSlots > 0 ? Number(((totalPresent / totalSlots) * 100).toFixed(2)) : 0;

    return {
      totalPresent,
      totalSlots,
      attendancePercentage,
    };
  }, [attendanceData]);

  const buildAnalyticsQueryParams = useCallback((
    extra?: Record<string, string | number | null | undefined>
  ) => {
    const params = new URLSearchParams();

    if (analyticsEventFilter !== "ALL") params.set("eventId", String(analyticsEventFilter));
    if (analyticsProblemFilter !== "ALL") params.set("problemId", String(analyticsProblemFilter));
    if (analyticsTeamFilter !== "ALL") params.set("teamId", String(analyticsTeamFilter));
    params.set("session", String(analyticsSessionFilter));
    if (analyticsStageFilter !== "ALL") params.set("stage", analyticsStageFilter);
    if (analyticsStartDate) params.set("startDate", analyticsStartDate);
    if (analyticsEndDate) params.set("endDate", analyticsEndDate);

    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        if (value == null) continue;
        const normalized = typeof value === "string" ? value.trim() : String(value);
        if (normalized.length === 0) continue;
        params.set(key, normalized);
      }
    }

    return params;
  }, [
    analyticsEventFilter,
    analyticsProblemFilter,
    analyticsTeamFilter,
    analyticsSessionFilter,
    analyticsStageFilter,
    analyticsStartDate,
    analyticsEndDate,
  ]);

  const getDefaultRubricsForClaim = useCallback((claim: ManagedHackathonSubmission): HackathonRubrics => ({
    innovation: clampRubricScore(claim.innovationScore ?? Math.round(HACKATHON_RUBRIC_WEIGHTS.innovation * 0.7), HACKATHON_RUBRIC_WEIGHTS.innovation),
    technical: clampRubricScore(claim.technicalScore ?? Math.round(HACKATHON_RUBRIC_WEIGHTS.technical * 0.7), HACKATHON_RUBRIC_WEIGHTS.technical),
    impact: clampRubricScore(claim.impactScore ?? Math.round(HACKATHON_RUBRIC_WEIGHTS.impact * 0.7), HACKATHON_RUBRIC_WEIGHTS.impact),
    ux: clampRubricScore(claim.uxScore ?? Math.round(HACKATHON_RUBRIC_WEIGHTS.ux * 0.7), HACKATHON_RUBRIC_WEIGHTS.ux),
    execution: clampRubricScore(claim.executionScore ?? Math.round(HACKATHON_RUBRIC_WEIGHTS.execution * 0.7), HACKATHON_RUBRIC_WEIGHTS.execution),
    presentation: clampRubricScore(claim.presentationScore ?? Math.round(HACKATHON_RUBRIC_WEIGHTS.presentation * 0.7), HACKATHON_RUBRIC_WEIGHTS.presentation),
    feasibility: clampRubricScore(claim.feasibilityScore ?? Math.round(HACKATHON_RUBRIC_WEIGHTS.feasibility * 0.7), HACKATHON_RUBRIC_WEIGHTS.feasibility),
  }), []);

  const hydrateRubricDrafts = useCallback((claims: ManagedHackathonSubmission[]) => {
    setJudgingRubricsByClaimId((prev) => {
      const next: Record<number, HackathonRubrics> = {};
      for (const claim of claims) {
        next[claim.id] = prev[claim.id] ?? getDefaultRubricsForClaim(claim);
      }
      return next;
    });
  }, [getDefaultRubricsForClaim]);

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
      ops === "emails" ||
      ops === "industry"
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
  }, [activeView, hydrateRubricDrafts]);

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

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedParticipantSearch(participantSearch.trim());
    }, 250);

    return () => clearTimeout(timer);
  }, [participantSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAttendanceSearch(attendanceSearch.trim());
    }, 250);

    return () => clearTimeout(timer);
  }, [attendanceSearch]);

  useEffect(() => {
    setAnalyticsProblemFilter("ALL");
    setAnalyticsTeamFilter("ALL");
    setParticipantPage(1);
    setTeamAnalyticsPage(1);
    setAttendancePage(1);
  }, [analyticsEventFilter]);

  useEffect(() => {
    if (analyticsSessionFilter > analyticsSessionLimit) {
      setAnalyticsSessionFilter(1);
    }
  }, [analyticsSessionFilter, analyticsSessionLimit]);

  useEffect(() => {
    setAnalyticsTeamFilter("ALL");
    setParticipantPage(1);
    setTeamAnalyticsPage(1);
    setAttendancePage(1);
  }, [analyticsProblemFilter]);

  useEffect(() => {
    setParticipantPage(1);
    setTeamAnalyticsPage(1);
    setAttendancePage(1);
  }, [analyticsSessionFilter]);

  useEffect(() => {
    setTeamManagementClaimId(null);
    setTeamMemberIdentifierInput("");
  }, [teamAnalyticsPage, teamAnalyticsPageSize, analyticsEventFilter, analyticsProblemFilter, analyticsSessionFilter]);

  const loadParticipantAnalytics = useCallback(async () => {
    try {
      setLoadingParticipantData(true);
      const params = buildAnalyticsQueryParams({
        search: debouncedParticipantSearch || undefined,
        status: participantStatusFilter === "ALL" ? undefined : participantStatusFilter,
        page: participantPage,
        pageSize: participantPageSize,
      });

      const payload = await apiCall(`/api/innovation/admin/analytics/participants?${params.toString()}`, {
        method: "GET",
      });

      setParticipantData((payload?.data || null) as ParticipantAnalyticsData | null);
    } catch (err) {
      setParticipantData(null);
      setErrorMessage(err instanceof Error ? err.message : "Could not load participant analytics.");
    } finally {
      setLoadingParticipantData(false);
    }
  }, [
    buildAnalyticsQueryParams,
    debouncedParticipantSearch,
    participantStatusFilter,
    participantPage,
    participantPageSize,
  ]);

  const loadTeamAnalytics = useCallback(async () => {
    try {
      setLoadingTeamData(true);
      const params = buildAnalyticsQueryParams({
        page: teamAnalyticsPage,
        pageSize: teamAnalyticsPageSize,
      });

      const payload = await apiCall(`/api/innovation/admin/analytics/teams?${params.toString()}`, {
        method: "GET",
      });

      setTeamData((payload?.data || null) as TeamAnalyticsData | null);
    } catch (err) {
      setTeamData(null);
      setErrorMessage(err instanceof Error ? err.message : "Could not load team analytics.");
    } finally {
      setLoadingTeamData(false);
    }
  }, [buildAnalyticsQueryParams, teamAnalyticsPage, teamAnalyticsPageSize]);

  const loadAttendanceAnalytics = useCallback(async () => {
    try {
      setLoadingAttendanceData(true);
      const params = buildAnalyticsQueryParams({
        search: debouncedAttendanceSearch || undefined,
        page: attendancePage,
        pageSize: attendancePageSize,
      });

      const payload = await apiCall(`/api/innovation/admin/analytics/attendance?${params.toString()}`, {
        method: "GET",
      });

      setAttendanceData((payload?.data || null) as AttendanceAnalyticsData | null);
    } catch (err) {
      setAttendanceData(null);
      setErrorMessage(err instanceof Error ? err.message : "Could not load attendance analytics.");
    } finally {
      setLoadingAttendanceData(false);
    }
  }, [
    buildAnalyticsQueryParams,
    debouncedAttendanceSearch,
    attendancePage,
    attendancePageSize,
  ]);

  const loadInsightsAnalytics = useCallback(async () => {
    try {
      setLoadingInsightsData(true);
      const params = buildAnalyticsQueryParams();
      const payload = await apiCall(`/api/innovation/admin/analytics/insights?${params.toString()}`, {
        method: "GET",
      });
      setInsightsData((payload?.data || null) as InsightsAnalyticsData | null);
    } catch (err) {
      setInsightsData(null);
      setErrorMessage(err instanceof Error ? err.message : "Could not load advanced analytics insights.");
    } finally {
      setLoadingInsightsData(false);
    }
  }, [buildAnalyticsQueryParams]);

  const refreshInnovationAnalytics = useCallback(async () => {
    await Promise.all([
      loadParticipantAnalytics(),
      loadTeamAnalytics(),
      loadAttendanceAnalytics(),
      loadInsightsAnalytics(),
    ]);
  }, [
    loadParticipantAnalytics,
    loadTeamAnalytics,
    loadAttendanceAnalytics,
    loadInsightsAnalytics,
  ]);

  const mutateTeamMembers = useCallback(
    async (
      claimId: number,
      payload: { action: "ADD_MEMBER"; identifier: string } | { action: "REMOVE_MEMBER" | "SET_LEAD"; claimMemberId: number },
      mutationKey: string,
      successFallback: string
    ) => {
      try {
        setErrorMessage("");
        setStatusMessage("");
        setTeamMemberMutationKey(mutationKey);

        const response = await apiCall(`/api/innovation/admin/teams/${claimId}/members`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });

        setStatusMessage(response?.message || successFallback);
        await refreshInnovationAnalytics();
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Could not update team members.");
      } finally {
        setTeamMemberMutationKey(null);
      }
    },
    [refreshInnovationAnalytics]
  );

  const handleAddTeamMember = useCallback(
    async (claimId: number) => {
      const identifier = teamMemberIdentifierInput.trim();
      if (!identifier) {
        setErrorMessage("Provide a UID or email to add a member.");
        return;
      }

      await mutateTeamMembers(
        claimId,
        { action: "ADD_MEMBER", identifier },
        `add:${claimId}`,
        "Team member added successfully."
      );
      setTeamMemberIdentifierInput("");
    },
    [mutateTeamMembers, teamMemberIdentifierInput]
  );

  const handleRemoveTeamMember = useCallback(
    async (claimId: number, claimMemberId: number) => {
      const confirmed = window.confirm("Remove this member from the team?");
      if (!confirmed) return;

      await mutateTeamMembers(
        claimId,
        { action: "REMOVE_MEMBER", claimMemberId },
        `remove:${claimId}:${claimMemberId}`,
        "Team member removed successfully."
      );
    },
    [mutateTeamMembers]
  );

  const handleSetTeamLead = useCallback(
    async (claimId: number, claimMemberId: number) => {
      await mutateTeamMembers(
        claimId,
        { action: "SET_LEAD", claimMemberId },
        `lead:${claimId}:${claimMemberId}`,
        "Team lead updated successfully."
      );
    },
    [mutateTeamMembers]
  );

  useEffect(() => {
    if (activeView !== "innovation" || innovationTab !== "analytics") return;
    void loadParticipantAnalytics();
  }, [activeView, innovationTab, loadParticipantAnalytics]);

  useEffect(() => {
    if (activeView !== "innovation" || innovationTab !== "analytics") return;
    void loadTeamAnalytics();
  }, [activeView, innovationTab, loadTeamAnalytics]);

  useEffect(() => {
    if (activeView !== "innovation" || innovationTab !== "analytics") return;
    void loadAttendanceAnalytics();
  }, [activeView, innovationTab, loadAttendanceAnalytics]);

  useEffect(() => {
    if (activeView !== "innovation" || innovationTab !== "analytics") return;
    void loadInsightsAnalytics();
  }, [activeView, innovationTab, loadInsightsAnalytics]);

  const handleExportParticipantCsv = () => {
    const params = buildAnalyticsQueryParams({
      search: debouncedParticipantSearch || undefined,
      status: participantStatusFilter === "ALL" ? undefined : participantStatusFilter,
    });

    const url = `/api/innovation/admin/analytics/participants/export?${params.toString()}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleExportAttendanceCsv = () => {
    const params = buildAnalyticsQueryParams({
      search: debouncedAttendanceSearch || undefined,
    });

    const url = `/api/innovation/admin/analytics/attendance/export?${params.toString()}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleMarkTeamAttendance = async (
    team: AttendanceAnalyticsData["items"][number],
    status: "PRESENT" | "NOT_PRESENT"
  ) => {
    const targetMemberUserIds = team.members
      .filter((member) => member.attendanceStatus !== status)
      .map((member) => member.userId);

    if (targetMemberUserIds.length === 0) {
      setStatusMessage(`All members for Team #${team.teamId} are already marked ${status} for session ${analyticsSessionFilter}.`);
      return;
    }

    try {
      setAttendanceUpdateKey(`team-${team.teamId}-${status}-${analyticsSessionFilter}`);
      setErrorMessage("");

      await Promise.all(
        targetMemberUserIds.map((userId) =>
          apiCall("/api/attendance", {
            method: "POST",
            body: JSON.stringify({
              claimId: team.teamId,
              userId,
              session: analyticsSessionFilter,
              status,
            }),
          })
        )
      );

      await Promise.all([loadAttendanceAnalytics(), loadTeamAnalytics(), loadInsightsAnalytics()]);
      setStatusMessage(`Team #${team.teamId} marked ${status} for session ${analyticsSessionFilter}.`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not update team attendance.");
    } finally {
      setAttendanceUpdateKey(null);
    }
  };

  const handleMarkMemberAttendance = async (
    teamId: number,
    userId: number,
    claimMemberId: number,
    status: "PRESENT" | "NOT_PRESENT"
  ) => {
    try {
      setAttendanceUpdateKey(`member-${teamId}-${claimMemberId}-${status}-${analyticsSessionFilter}`);
      setErrorMessage("");

      await apiCall("/api/attendance", {
        method: "POST",
        body: JSON.stringify({
          claimId: teamId,
          userId,
          session: analyticsSessionFilter,
          status,
        }),
      });

      await Promise.all([loadAttendanceAnalytics(), loadTeamAnalytics(), loadInsightsAnalytics()]);
      setStatusMessage(`Updated attendance for member #${claimMemberId} in session ${analyticsSessionFilter}.`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not update member attendance.");
    } finally {
      setAttendanceUpdateKey(null);
    }
  };

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
        body: JSON.stringify({
          ticketId: normalizedTicketId,
          session: ticketSession,
        }),
      });

      setTicketIdInput(normalizedTicketId);
      const result = (payload?.data || null) as TicketVerificationResult | null;
      setTicketVerifyResult(result);

      if (result?.mode === "HACKATHON") {
        if (typeof result.session === "number") {
          setTicketSession(result.session);
        }
        setSelectedPresentMemberIds([]);
        setStatusMessage(`Team ticket ${normalizedTicketId} loaded for session ${result.session ?? ticketSession}. Select present members and confirm check-in.`);
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
          session: ticketSession,
          presentClaimMemberIds: selectedPresentMemberIds,
        }),
      });

      const result = (payload?.data || null) as TicketVerificationResult | null;
      setTicketVerifyResult(result);
      setSelectedPresentMemberIds([]);

      if (result?.mode === "HACKATHON") {
        if (typeof result.session === "number") {
          setTicketSession(result.session);
        }
        setStatusMessage(
          `Session ${result.session ?? ticketSession}: marked ${result.newlyMarkedCount ?? 0} member(s) present. ${result.presentCount ?? 0}/${
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
    setSelectedPresentMemberIds([]);
  }, [ticketSession]);

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

  const handleOpenUserDetails = async (id: number) => {
    try {
      setErrorMessage("");
      setSelectedUserDetailId(id);
      setSelectedUserDetail(null);
      setLoadingUserDetail(true);

      const payload = await apiCall(`/api/admin/users/${id}`, { method: "GET" });
      setSelectedUserDetail((payload?.data || null) as AdminUserDetail | null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not load user details.");
      setSelectedUserDetailId(null);
      setSelectedUserDetail(null);
    } finally {
      setLoadingUserDetail(false);
    }
  };

  const closeUserDetailsModal = () => {
    setSelectedUserDetailId(null);
    setSelectedUserDetail(null);
    setLoadingUserDetail(false);
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

    const preparedProblems = eventProblems
      .map((problem) => ({
        title: problem.title.trim(),
        description: problem.description.trim(),
        isIndustryProblem: problem.isIndustryProblem,
        industryName: problem.isIndustryProblem ? problem.industryName.trim() : "",
        supportDocumentFile: problem.supportDocumentFile,
      }))
      .filter((problem) => problem.title.length > 0 || problem.description.length > 0);

    const problemsPayload = preparedProblems.map((problem) => ({
      title: problem.title,
      description: problem.description,
      isIndustryProblem: problem.isIndustryProblem,
      industryName: problem.industryName,
    }));

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
      formData.set("startTime", new Date(eventStartTime).toISOString());
      formData.set("endTime", new Date(eventEndTime).toISOString());
      formData.set("totalSessions", String(eventTotalSessions));
      formData.set("problems", JSON.stringify(problemsPayload));
      if (eventPptFile) {
        formData.set("pptFile", eventPptFile);
      }
      preparedProblems.forEach((problem, index) => {
        if (problem.supportDocumentFile) {
          formData.set(`problemSupportDocument_${index}`, problem.supportDocumentFile);
        }
      });

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
      setEventTotalSessions(1);
      setEventPptFile(null);
      setEventProblems([{ title: "", description: "", isIndustryProblem: false, industryName: "", supportDocumentFile: null }]);
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
    setEventProblems((prev) => [...prev, { title: "", description: "", isIndustryProblem: false, industryName: "", supportDocumentFile: null }]);
  };

  const removeEventProblemInput = (index: number) => {
    setEventProblems((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== index)));
  };

  const loadEventEditor = async (eventRow: InnovationEvent) => {
    try {
      setErrorMessage("");
      setStatusMessage("");
      setEventEditDraft({
        eventId: eventRow.id,
        title: eventRow.title,
        description: eventRow.description || "",
        startTime: toDateTimeLocalValue(eventRow.startTime),
        endTime: toDateTimeLocalValue(eventRow.endTime),
        totalSessions: Math.max(1, eventRow.totalSessions ?? 1),
        registrationOpen: eventRow.registrationOpen,
        status: eventRow.status,
        pptFile: null,
        removePptFile: false,
        problems: [],
        deletedProblemIds: [],
      });
      setEventEditLoading(true);

      const payload = await apiCall(
        `/api/innovation/problems?track=all&eventId=${eventRow.id}&visibility=internal&includeAllStatuses=true`,
        { method: "GET" }
      );

      const problems = ((payload?.data || []) as Array<any>).map((problem) => ({
        id: problem.id as number,
        title: String(problem.title || ""),
        description: String(problem.description || ""),
        isIndustryProblem: Boolean(problem.isIndustryProblem),
        industryName: String(problem.industryName || ""),
        supportDocumentUrl: typeof problem.supportDocumentUrl === "string" ? problem.supportDocumentUrl : null,
        supportDocumentFile: null,
        removeSupportDocument: false,
      }));

      setEventEditDraft({
        eventId: eventRow.id,
        title: eventRow.title,
        description: eventRow.description || "",
        startTime: toDateTimeLocalValue(eventRow.startTime),
        endTime: toDateTimeLocalValue(eventRow.endTime),
        totalSessions: Math.max(1, eventRow.totalSessions ?? 1),
        registrationOpen: eventRow.registrationOpen,
        status: eventRow.status,
        pptFile: null,
        removePptFile: false,
        problems,
        deletedProblemIds: [],
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not load event editor data.");
    } finally {
      setEventEditLoading(false);
    }
  };

  const closeEventEditor = () => {
    setEventEditDraft(null);
    setEventEditLoading(false);
    setEventEditSaving(false);
  };

  const updateEventEditorProblem = (index: number, updates: Partial<EventProblemRow>) => {
    setEventEditDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        problems: prev.problems.map((problem, idx) => (idx === index ? { ...problem, ...updates } : problem)),
      };
    });
  };

  const addEventEditorProblem = () => {
    setEventEditDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        problems: [
          ...prev.problems,
          {
            title: "",
            description: "",
            isIndustryProblem: false,
            industryName: "",
            supportDocumentUrl: null,
            supportDocumentFile: null,
            removeSupportDocument: false,
          },
        ],
      };
    });
  };

  const removeEventEditorProblem = (index: number) => {
    setEventEditDraft((prev) => {
      if (!prev) return prev;
      const target = prev.problems[index];
      if (!target) return prev;

      const nextDeleted = target.id ? [...prev.deletedProblemIds, target.id] : prev.deletedProblemIds;
      return {
        ...prev,
        problems: prev.problems.filter((_, idx) => idx !== index),
        deletedProblemIds: Array.from(new Set(nextDeleted)),
      };
    });
  };

  const saveEventEditor = async () => {
    if (!eventEditDraft) return;

    const normalizedProblems = eventEditDraft.problems
      .map((problem) => ({
        ...problem,
        title: problem.title.trim(),
        description: problem.description.trim(),
        industryName: problem.industryName.trim(),
      }))
      .filter((problem) => problem.title.length > 0 || problem.description.length > 0);

    if (normalizedProblems.length === 0) {
      setErrorMessage("Please keep at least one problem statement for the event.");
      return;
    }

    if (normalizedProblems.some((problem) => problem.title.length < 2 || problem.description.length < 5)) {
      setErrorMessage("Each problem statement must include a valid title and description.");
      return;
    }

    if (
      normalizedProblems.some(
        (problem) => problem.isIndustryProblem && problem.industryName.trim().length < 2
      )
    ) {
      setErrorMessage("Industry problems must include a valid industry name.");
      return;
    }

    if (!eventEditDraft.startTime || !eventEditDraft.endTime) {
      setErrorMessage("Start time and end time are required.");
      return;
    }

    try {
      setErrorMessage("");
      setStatusMessage("");
      setEventEditSaving(true);

      const formData = new FormData();
      formData.set("title", eventEditDraft.title.trim());
      formData.set("description", eventEditDraft.description.trim());
      formData.set("startTime", new Date(eventEditDraft.startTime).toISOString());
      formData.set("endTime", new Date(eventEditDraft.endTime).toISOString());
      formData.set("totalSessions", String(eventEditDraft.totalSessions));
      formData.set("registrationOpen", String(eventEditDraft.registrationOpen));
      formData.set("status", eventEditDraft.status);
      if (eventEditDraft.removePptFile) {
        formData.set("removePptFile", "true");
      }
      if (eventEditDraft.pptFile) {
        formData.set("pptFile", eventEditDraft.pptFile);
      }

      const eventUpdateRes = await fetch(`/api/innovation/events/${eventEditDraft.eventId}`, {
        method: "PATCH",
        body: formData,
        credentials: "include",
      });
      const eventUpdatePayload = await eventUpdateRes.json().catch(() => ({}));
      if (!eventUpdateRes.ok) {
        throw new Error(eventUpdatePayload?.message || "Could not update hackathon event details.");
      }

      for (const problemId of eventEditDraft.deletedProblemIds) {
        await apiCall(`/api/innovation/problems/${problemId}`, { method: "DELETE" });
      }

      for (const problem of normalizedProblems) {
        if (problem.id) {
          const problemFormData = new FormData();
          problemFormData.set("title", problem.title);
          problemFormData.set("description", problem.description);
          problemFormData.set("isIndustryProblem", String(problem.isIndustryProblem));
          problemFormData.set("industryName", problem.isIndustryProblem ? problem.industryName : "");
          if (problem.removeSupportDocument) {
            problemFormData.set("removeSupportDocument", "true");
          }
          if (problem.supportDocumentFile) {
            problemFormData.set("supportDocument", problem.supportDocumentFile);
          }

          const problemUpdateRes = await fetch(`/api/innovation/problems/${problem.id}`, {
            method: "PATCH",
            body: problemFormData,
            credentials: "include",
          });
          const problemUpdatePayload = await problemUpdateRes.json().catch(() => ({}));
          if (!problemUpdateRes.ok) {
            throw new Error(problemUpdatePayload?.message || `Could not update problem #${problem.id}.`);
          }
        } else {
          const problemCreateFormData = new FormData();
          problemCreateFormData.set("title", problem.title);
          problemCreateFormData.set("description", problem.description);
          problemCreateFormData.set("tags", "");
          problemCreateFormData.set("mode", "CLOSED");
          problemCreateFormData.set("problemType", "OPEN");
          problemCreateFormData.set("eventId", String(eventEditDraft.eventId));
          problemCreateFormData.set("isIndustryProblem", String(problem.isIndustryProblem));
          problemCreateFormData.set("industryName", problem.isIndustryProblem ? problem.industryName : "");
          if (problem.supportDocumentFile) {
            problemCreateFormData.set("supportDocument", problem.supportDocumentFile);
          }

          const problemCreateRes = await fetch(`/api/innovation/problems`, {
            method: "POST",
            body: problemCreateFormData,
            credentials: "include",
          });
          const problemCreatePayload = await problemCreateRes.json().catch(() => ({}));
          if (!problemCreateRes.ok) {
            throw new Error(problemCreatePayload?.message || "Could not create new event problem statement.");
          }
        }
      }

      setStatusMessage("Hackathon event and problem statements updated successfully.");
      closeEventEditor();
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not save event editor changes.");
    } finally {
      setEventEditSaving(false);
    }
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

  const handleToggleSessionUploadLock = async (eventId: number, session: number, isOpen: boolean) => {
    const mutationKey = `${eventId}:${session}`;

    try {
      setErrorMessage("");
      setStatusMessage("");
      setSessionLockMutationKey(mutationKey);

      await apiCall(`/api/innovation/events/${eventId}/session-upload-locks`, {
        method: "PATCH",
        body: JSON.stringify({ session, isOpen }),
      });

      setStatusMessage(`Session ${session} uploads ${isOpen ? "opened" : "closed"} for event #${eventId}.`);
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not update session upload lock.");
    } finally {
      setSessionLockMutationKey(null);
    }
  };

  const loadIndustryDirectory = async () => {
    try {
      setLoadingIndustryDirectory(true);
      const payload = await apiCall("/api/admin/industry-partners", {
        method: "GET",
      });

      const directory = (payload?.data || []) as IndustryDirectoryRow[];
      setIndustryDirectory(directory);

      const flattenedPartners = directory
        .flatMap((industry) =>
          (industry.users || []).map((member) => ({
            ...member,
            industry: { id: industry.id, name: industry.name },
          }))
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setIndustryPartners(flattenedPartners);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not load industry directory.");
    } finally {
      setLoadingIndustryDirectory(false);
    }
  };

  const handleCreateIndustryPartner = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatusMessage("");
    setErrorMessage("");
    setCreatingIndustryPartner(true);

    try {
      const payload = await apiCall("/api/admin/industry-partners", {
        method: "POST",
        body: JSON.stringify({
          name: industryPartnerName.trim() || undefined,
          email: industryPartnerEmail.trim(),
          phone: industryPartnerPhone.trim() || undefined,
          password: industryPartnerPassword || undefined,
          industryId: selectedIndustryOption !== "NEW" ? Number(selectedIndustryOption) : undefined,
          industryName: selectedIndustryOption === "NEW" ? industryNameInput.trim() : undefined,
        }),
      });

      const created = payload?.data as IndustryPartnerSummary;
      if (created?.id) {
        setIndustryPartners((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      }

      await loadIndustryDirectory();

      setIndustryPartnerName("");
      setIndustryPartnerEmail("");
      setIndustryPartnerPhone("");
      setIndustryPartnerPassword("");
      if (selectedIndustryOption === "NEW") {
        setIndustryNameInput("");
      }
      setStatusMessage("Industry partner account created successfully.");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not create industry partner account.");
    } finally {
      setCreatingIndustryPartner(false);
    }
  };

  useEffect(() => {
    if (operationsTab !== "industry") return;
    void loadIndustryDirectory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operationsTab]);

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
        innovation: Math.round(HACKATHON_RUBRIC_WEIGHTS.innovation * 0.7),
        technical: Math.round(HACKATHON_RUBRIC_WEIGHTS.technical * 0.7),
        impact: Math.round(HACKATHON_RUBRIC_WEIGHTS.impact * 0.7),
        ux: Math.round(HACKATHON_RUBRIC_WEIGHTS.ux * 0.7),
        execution: Math.round(HACKATHON_RUBRIC_WEIGHTS.execution * 0.7),
        presentation: Math.round(HACKATHON_RUBRIC_WEIGHTS.presentation * 0.7),
        feasibility: Math.round(HACKATHON_RUBRIC_WEIGHTS.feasibility * 0.7),
      };

      const max = HACKATHON_RUBRIC_WEIGHTS[key];

      return {
        ...prev,
        [claimId]: {
          ...base,
          [key]: clampRubricScore(rawValue, max),
        },
      };
    });
  };

  const getJudgingRubrics = (claim: ManagedHackathonSubmission): HackathonRubrics => {
    return judgingRubricsByClaimId[claim.id] ?? getDefaultRubricsForClaim(claim);
  };

  const liveJudgingLeaderboard = useMemo(() => {
    const rows = filteredManagedSubmissions
      .filter((claim) => ["SHORTLISTED", "ACCEPTED", "REJECTED"].includes(claim.status))
      .map((claim) => {
        const hasDraftRubrics = Boolean(judgingRubricsByClaimId[claim.id]);
        const draftScore = hasDraftRubrics ? getRubricTotalScore(getJudgingRubrics(claim)) : null;
        const score = draftScore ?? claim.finalScore;

        return {
          claimId: claim.id,
          teamName: claim.teamName || `Team-${claim.id}`,
          score,
          updatedAt: claim.updatedAt,
          hasDraftRubrics,
          status: claim.status,
        };
      })
      .filter((row): row is {
        claimId: number;
        teamName: string;
        score: number;
        updatedAt: string;
        hasDraftRubrics: boolean;
        status: ManagedHackathonSubmission["status"];
      } => typeof row.score === "number")
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      });

    return rows.map((row, index) => ({
      rank: index + 1,
      ...row,
    }));
  }, [filteredManagedSubmissions, judgingRubricsByClaimId, getJudgingRubrics]);

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
          <button
            onClick={() => setOperationsTab("industry")}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border ${
              operationsTab === "industry" ? "bg-[#002155] text-white border-[#002155]" : "bg-white text-[#002155] border-[#c4c6d3]"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              Industry Internship
              <span className="px-2 py-[1px] rounded-full text-[10px] font-bold bg-[#e8e6e0] text-[#434651]">
                {industryPartners.length}
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
          {operationsTab === "industry" ? "Create industry partner accounts and manage internship workflow access points." : null}
        </p>
      </section>

      {operationsTab === "industry" ? (
      <section className="mb-10 space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <article className="border border-[#c4c6d3] bg-white p-5">
            <h2 className="font-headline text-2xl text-[#002155]">Add Industry Team Member</h2>
            <p className="mt-2 text-sm text-[#434651]">
              Assign an existing user by email to an industry, or create a new industry partner account when the email does not exist.
            </p>

            <form className="mt-4 space-y-3" onSubmit={handleCreateIndustryPartner}>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#434651]">Select Industry</label>
              <select
                value={selectedIndustryOption}
                onChange={(e) => setSelectedIndustryOption(e.target.value)}
                className="w-full border border-[#c4c6d3] px-3 py-2 text-sm"
              >
                <option value="NEW">+ Create New Industry</option>
                {industryDirectory.map((industry) => (
                  <option key={`industry-option-${industry.id}`} value={String(industry.id)}>
                    {industry.name}
                  </option>
                ))}
              </select>

              {selectedIndustryOption === "NEW" ? (
                <input
                  required
                  value={industryNameInput}
                  onChange={(e) => setIndustryNameInput(e.target.value)}
                  className="w-full border border-[#c4c6d3] px-3 py-2 text-sm"
                  placeholder="New industry/company name"
                />
              ) : null}

              <input
                value={industryPartnerName}
                onChange={(e) => setIndustryPartnerName(e.target.value)}
                className="w-full border border-[#c4c6d3] px-3 py-2 text-sm"
                placeholder="Contact person name (required for new account)"
              />
              <input
                required
                type="email"
                value={industryPartnerEmail}
                onChange={(e) => setIndustryPartnerEmail(e.target.value)}
                className="w-full border border-[#c4c6d3] px-3 py-2 text-sm"
                placeholder="Member email"
              />
              <input
                value={industryPartnerPhone}
                onChange={(e) => setIndustryPartnerPhone(e.target.value)}
                className="w-full border border-[#c4c6d3] px-3 py-2 text-sm"
                placeholder="Phone (optional)"
              />
              <input
                type="password"
                minLength={8}
                value={industryPartnerPassword}
                onChange={(e) => setIndustryPartnerPassword(e.target.value)}
                className="w-full border border-[#c4c6d3] px-3 py-2 text-sm"
                placeholder="Temporary password (required for new account)"
              />

              <button
                type="submit"
                disabled={creatingIndustryPartner}
                className="bg-[#002155] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-60"
              >
                {creatingIndustryPartner ? "Saving..." : "Assign To Industry"}
              </button>
            </form>
          </article>

          <article className="border border-[#c4c6d3] bg-white p-5">
            <h2 className="font-headline text-2xl text-[#002155]">Quick Access</h2>
            <p className="mt-2 text-sm text-[#434651]">
              Open all internship module surfaces from here.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-2">
              <Link href="/industry-internship" className="border border-[#8c4f00] px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-[#8c4f00]">
                Internship Board (Public)
              </Link>
              <Link href="/innovation/faculty" className="border border-[#0b6b2e] px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-[#0b6b2e]">
                Approvals And Workspace
              </Link>
              <Link href="/innovation/faculty/applications" className="border border-[#002155] px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-[#002155]">
                Internship Applications
              </Link>
            </div>

            <button
              type="button"
              onClick={() => void loadIndustryDirectory()}
              disabled={loadingIndustryDirectory}
              className="mt-3 border border-[#002155] px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#002155] disabled:opacity-60"
            >
              {loadingIndustryDirectory ? "Refreshing..." : "Refresh Industry Directory"}
            </button>
          </article>
        </div>

        <article className="border border-[#c4c6d3] bg-white p-5">
          <h2 className="font-headline text-2xl text-[#002155]">Industries</h2>
          <p className="mt-2 text-sm text-[#434651]">Shared ownership groups used by industry partner members.</p>

          {industryDirectory.length === 0 ? (
            <p className="mt-4 border border-dashed border-[#c4c6d3] p-4 text-sm text-[#434651]">
              No industries configured yet.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {industryDirectory.map((industry) => (
                <div key={`industry-card-${industry.id}`} className="border border-[#e3e2df] bg-[#faf9f5] p-3">
                  <p className="text-sm font-bold text-[#002155]">{industry.name}</p>
                  <p className="mt-1 text-xs text-[#434651]">
                    Members: {industry.users.length} • Internship Problems: {industry._count.problems}
                  </p>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="border border-[#c4c6d3] bg-white p-5">
          <h2 className="font-headline text-2xl text-[#002155]">Industry Members</h2>
          <p className="mt-2 text-sm text-[#434651]">All users mapped to industries for shared internship dashboards.</p>

          {industryPartners.length === 0 ? (
            <p className="mt-4 border border-dashed border-[#c4c6d3] p-4 text-sm text-[#434651]">
              No industry partner accounts yet.
            </p>
          ) : (
            <div className="mt-4 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#f5f4f0] text-left text-xs uppercase tracking-widest text-[#434651]">
                    <th className="px-3 py-2">Industry</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Phone</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {industryPartners.map((partner) => (
                    <tr key={partner.id} className="border-t border-[#ecebe7]">
                      <td className="px-3 py-2 text-[#434651]">{partner.industry?.name || "Unassigned"}</td>
                      <td className="px-3 py-2 text-[#002155] font-medium">{partner.name}</td>
                      <td className="px-3 py-2 text-[#434651]">{partner.email}</td>
                      <td className="px-3 py-2 text-[#434651]">{partner.phone || "-"}</td>
                      <td className="px-3 py-2 text-[#434651]">{partner.status}</td>
                      <td className="px-3 py-2 text-[#434651]">{formatIstDateTime(partner.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>
      ) : null}

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

        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto_auto] gap-3 mb-4">
          <input
            value={ticketIdInput}
            onChange={(e) => setTicketIdInput(e.target.value)}
            className="border border-[#c4c6d3] px-3 py-2 text-sm"
            placeholder="Enter ticket ID or paste QR URL"
          />
          <input
            type="number"
            min={1}
            max={ticketVerifyResult?.mode === "HACKATHON" ? Math.max(1, ticketVerifyResult.totalSessions ?? 1) : 30}
            value={ticketSession}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (!Number.isFinite(next) || next <= 0) {
                setTicketSession(1);
                return;
              }
              const upperBound =
                ticketVerifyResult?.mode === "HACKATHON"
                  ? Math.max(1, ticketVerifyResult.totalSessions ?? 1)
                  : 30;
              setTicketSession(Math.min(Math.max(1, Math.floor(next)), upperBound));
            }}
            className="border border-[#c4c6d3] px-3 py-2 text-sm"
            placeholder="Session"
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
                  <p><span className="text-[#747782]">Session:</span> <span className="text-[#002155] font-semibold">{ticketVerifyResult.session ?? ticketSession} / {ticketVerifyResult.totalSessions ?? 1}</span></p>
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
          <h2 className="font-headline text-2xl text-[#002155]">All Users Directory</h2>
          <span className="text-xs uppercase tracking-widest text-[#434651] font-label">{users.length} total</span>
        </div>

        <div className="overflow-x-auto border border-[#c4c6d3] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#f5f4f0] text-[#434651] uppercase text-xs tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Phone</th>
                <th className="text-left px-4 py-3">UID</th>
              </tr>
            </thead>
            <tbody>
              {allUsers.map((user) => (
                <tr key={user.id} className="border-t border-[#e3e2df]">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleOpenUserDetails(user.id)}
                      className="text-[#002155] font-semibold underline underline-offset-4"
                    >
                      {user.name}
                    </button>
                  </td>
                  <td className="px-4 py-3">{user.phone || "Not provided"}</td>
                  <td className="px-4 py-3">{user.uid || "Not provided"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selectedUserDetailId !== null ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-[#00122f]/70 p-4 md:p-8 overflow-y-auto">
          <div className="w-full max-w-4xl border border-[#c4c6d3] bg-white">
            <div className="flex items-center justify-between border-b border-[#e3e2df] px-5 py-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-[#434651] font-label">User Details</p>
                <h3 className="mt-1 font-headline text-2xl text-[#002155]">
                  {selectedUserDetail?.name || `User #${selectedUserDetailId}`}
                </h3>
              </div>
              <button
                onClick={closeUserDetailsModal}
                className="border border-[#c4c6d3] px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#434651]"
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-6">
              {loadingUserDetail ? <p className="text-sm text-[#434651]">Loading full user details...</p> : null}

              {!loadingUserDetail && selectedUserDetail ? (
                <>
                  <section className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="border border-[#e3e2df] p-4">
                      <p className="font-bold text-[#002155]">Account</p>
                      <p className="mt-2 text-[#434651]">Name: {selectedUserDetail.name}</p>
                      <p className="text-[#434651]">Email: {selectedUserDetail.email}</p>
                      <p className="text-[#434651]">Phone: {selectedUserDetail.phone || "Not provided"}</p>
                      <p className="text-[#434651]">UID: {selectedUserDetail.uid || "Not provided"}</p>
                      <p className="text-[#434651]">Role: {selectedUserDetail.role}</p>
                      <p className="text-[#434651]">Status: {selectedUserDetail.status}</p>
                      <p className="text-[#434651]">Verified: {selectedUserDetail.isVerified ? "Yes" : "No"}</p>
                      <p className="text-[#434651]">Created: {new Date(selectedUserDetail.createdAt).toLocaleString()}</p>
                      <p className="text-[#434651]">Updated: {new Date(selectedUserDetail.updatedAt).toLocaleString()}</p>
                    </div>

                    <div className="border border-[#e3e2df] p-4">
                      <p className="font-bold text-[#002155]">Counts</p>
                      <p className="mt-2 text-[#434651]">Bookings: {selectedUserDetail._count.bookings}</p>
                      <p className="text-[#434651]">Applications: {selectedUserDetail._count.applications}</p>
                      <p className="text-[#434651]">Claims: {selectedUserDetail._count.problemsCreated}</p>
                      <p className="text-[#434651]">Tickets: {selectedUserDetail._count.tickets}</p>
                      <p className="text-[#434651]">Problems Authored: {selectedUserDetail._count.problemsAuthored}</p>
                      <p className="mt-3 font-bold text-[#002155]">Industry</p>
                      <p className="text-[#434651]">
                        {selectedUserDetail.industry
                          ? `${selectedUserDetail.industry.name} (#${selectedUserDetail.industry.id})`
                          : "Not mapped"}
                      </p>
                    </div>
                  </section>

                  <section className="border border-[#e3e2df] p-4 text-sm">
                    <p className="font-bold text-[#002155]">Student Profile</p>
                    {selectedUserDetail.studentProfile ? (
                      <>
                        <p className="mt-2 text-[#434651]">Profile Complete: {selectedUserDetail.studentProfile.isComplete ? "Yes" : "No"}</p>
                        <p className="text-[#434651]">Skills: {selectedUserDetail.studentProfile.skills || "Not provided"}</p>
                        <p className="text-[#434651]">Experience: {selectedUserDetail.studentProfile.experience || "Not provided"}</p>
                        <p className="text-[#434651]">Interests: {selectedUserDetail.studentProfile.interests || "Not provided"}</p>
                        <p className="text-[#434651]">Resume: {selectedUserDetail.studentProfile.resumeFileName || "Not uploaded"}</p>
                        {selectedUserDetail.studentProfile.resumeDownloadUrl ? (
                          <a
                            href={selectedUserDetail.studentProfile.resumeDownloadUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-block text-[#002155] font-semibold underline underline-offset-4"
                          >
                            Open Resume
                          </a>
                        ) : null}
                      </>
                    ) : (
                      <p className="mt-2 text-[#434651]">No student profile available for this account.</p>
                    )}
                  </section>

                  <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
                    <div className="border border-[#e3e2df] p-4">
                      <p className="font-bold text-[#002155]">Bookings</p>
                      {selectedUserDetail.bookings.length === 0 ? (
                        <p className="mt-2 text-[#434651]">No bookings</p>
                      ) : (
                        <ul className="mt-2 space-y-1 text-[#434651]">
                          {selectedUserDetail.bookings.map((booking) => (
                            <li key={booking.id}>#{booking.id} • {booking.lab} • {booking.timeSlot} • {booking.status}</li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="border border-[#e3e2df] p-4">
                      <p className="font-bold text-[#002155]">Applications</p>
                      {selectedUserDetail.applications.length === 0 ? (
                        <p className="mt-2 text-[#434651]">No applications</p>
                      ) : (
                        <ul className="mt-2 space-y-1 text-[#434651]">
                          {selectedUserDetail.applications.map((application) => (
                            <li key={application.id}>#{application.id} • {application.problem.title} • {application.status}</li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="border border-[#e3e2df] p-4">
                      <p className="font-bold text-[#002155]">Claims / Teams</p>
                      {selectedUserDetail.claimMemberships.length === 0 ? (
                        <p className="mt-2 text-[#434651]">No claims</p>
                      ) : (
                        <ul className="mt-2 space-y-1 text-[#434651]">
                          {selectedUserDetail.claimMemberships.map((claimMember) => (
                            <li key={claimMember.id}>
                              Claim #{claimMember.claim.id} • {claimMember.claim.problem.title} • {claimMember.claim.status} • {claimMember.role}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="border border-[#e3e2df] p-4">
                      <p className="font-bold text-[#002155]">Tickets</p>
                      {selectedUserDetail.tickets.length === 0 ? (
                        <p className="mt-2 text-[#434651]">No tickets</p>
                      ) : (
                        <ul className="mt-2 space-y-1 text-[#434651]">
                          {selectedUserDetail.tickets.map((ticket) => (
                            <li key={ticket.id}>{ticket.ticketId} • {ticket.type} • {ticket.status} • {ticket.subjectName}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </section>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

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

          <section className="border border-[#c4c6d3] bg-white p-3">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setInnovationTab("events")}
                className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border ${
                  innovationTab === "events"
                    ? "bg-[#002155] text-white border-[#002155]"
                    : "bg-white text-[#002155] border-[#c4c6d3]"
                }`}
              >
                Events
              </button>
              <button
                onClick={() => setInnovationTab("review")}
                className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border ${
                  innovationTab === "review"
                    ? "bg-[#002155] text-white border-[#002155]"
                    : "bg-white text-[#002155] border-[#c4c6d3]"
                }`}
              >
                Review Queue
              </button>
              <button
                onClick={() => setInnovationTab("leaderboard")}
                className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border ${
                  innovationTab === "leaderboard"
                    ? "bg-[#002155] text-white border-[#002155]"
                    : "bg-white text-[#002155] border-[#c4c6d3]"
                }`}
              >
                Leaderboard
              </button>
              <button
                onClick={() => setInnovationTab("analytics")}
                className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border ${
                  innovationTab === "analytics"
                    ? "bg-[#002155] text-white border-[#002155]"
                    : "bg-white text-[#002155] border-[#c4c6d3]"
                }`}
              >
                Analytics
              </button>
            </div>
          </section>

          {innovationTab === "events" ? (
            <>

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
                  <label className="block text-xs uppercase tracking-widest text-[#434651] mb-2">Total Sessions</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    required
                    value={eventTotalSessions}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (!Number.isFinite(next) || next <= 0) {
                        setEventTotalSessions(1);
                        return;
                      }
                      setEventTotalSessions(Math.min(30, Math.floor(next)));
                    }}
                    className="w-full border border-[#c4c6d3] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <p className="text-xs text-[#434651]">
                Session document upload windows are controlled after event creation using per-session OPEN/CLOSE toggles.
              </p>

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

                    <div>
                      <label className="block text-xs uppercase tracking-widest text-[#434651] mb-2">Problem PDF (optional)</label>
                      <input
                        type="file"
                        accept=".pdf,application/pdf"
                        onChange={(e) => updateEventProblem(idx, { supportDocumentFile: e.target.files?.[0] ?? null })}
                        className="w-full border border-[#c4c6d3] px-3 py-2 text-sm"
                      />
                    </div>

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
                      <p className="mt-1 text-xs text-[#434651]">Required sessions: {event.totalSessions ?? 1}</p>
                      <p className="mt-1 text-xs text-[#434651]">{formatIstDateTime(event.startTime)} to {formatIstDateTime(event.endTime)}</p>
                      <p className="mt-1 text-xs text-[#434651]">Session uploads: Admin-controlled (per-session open/close)</p>
                      {event.pptFileUrl ? (
                        <a
                          href={event.pptFileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex mt-2 text-xs font-bold uppercase tracking-wider text-[#8c4f00] underline"
                        >
                          View Event PPT/PDF
                        </a>
                      ) : null}
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
                          onClick={() => {
                            setInnovationTab("leaderboard");
                            void handleLoadInnovationLeaderboard(event.id);
                          }}
                          className="border border-[#002155] text-[#002155] px-3 py-2 text-xs font-bold uppercase tracking-wider"
                        >
                          Leaderboard
                        </button>
                        <button
                          onClick={() => {
                            if (eventEditDraft?.eventId === event.id) {
                              closeEventEditor();
                            } else {
                              void loadEventEditor(event);
                            }
                          }}
                          className="border border-[#002155] text-[#002155] px-3 py-2 text-xs font-bold uppercase tracking-wider"
                        >
                          {eventEditDraft?.eventId === event.id ? "Close Editor" : "Edit Event & Problems"}
                        </button>
                        <Link
                          href={`/innovation/events/${event.id}`}
                          className="border border-[#8c4f00] text-[#8c4f00] px-3 py-2 text-xs font-bold uppercase tracking-wider"
                        >
                          View Event Page
                        </Link>
                      </div>

                      <div className="mt-3 border border-[#e3e2df] bg-[#faf9f5] p-3">
                        <p className="text-xs font-bold uppercase tracking-wider text-[#002155]">Session Document Upload Locks</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {Array.from({ length: Math.max(1, event.totalSessions ?? 1) }, (_, idx) => {
                            const session = idx + 1;
                            const current = event.sessionUploadLocks?.find((row) => row.session === session);
                            const isOpen = Boolean(current?.isOpen);
                            const mutationKey = `${event.id}:${session}`;

                            return (
                              <button
                                key={`session-lock-${event.id}-${session}`}
                                onClick={() => void handleToggleSessionUploadLock(event.id, session, !isOpen)}
                                disabled={sessionLockMutationKey === mutationKey}
                                className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border disabled:opacity-60 ${
                                  isOpen
                                    ? "bg-[#0b6b2e] text-white border-[#0b6b2e]"
                                    : "bg-white text-[#ba1a1a] border-[#ba1a1a]"
                                }`}
                              >
                                S{session}: {sessionLockMutationKey === mutationKey ? "Saving..." : isOpen ? "OPEN" : "CLOSED"}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {eventEditDraft?.eventId === event.id ? (
                        <div className="mt-4 border border-[#d8d6cf] bg-[#faf9f5] p-4 space-y-4">
                          {eventEditLoading ? (
                            <p className="text-sm text-[#434651]">Loading event editor...</p>
                          ) : (
                            <>
                              <p className="text-sm font-bold uppercase tracking-wider text-[#002155]">Edit Hackathon Event</p>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <input
                                  value={eventEditDraft.title}
                                  onChange={(e) => setEventEditDraft((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                                  className="border border-[#c4c6d3] px-3 py-2 text-sm"
                                  placeholder="Event title"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  max={30}
                                  value={eventEditDraft.totalSessions}
                                  onChange={(e) => {
                                    const next = Number(e.target.value);
                                    if (!Number.isFinite(next) || next <= 0) return;
                                    setEventEditDraft((prev) => (prev ? { ...prev, totalSessions: Math.min(30, Math.floor(next)) } : prev));
                                  }}
                                  className="border border-[#c4c6d3] px-3 py-2 text-sm"
                                  placeholder="Total sessions"
                                />
                              </div>

                              <textarea
                                value={eventEditDraft.description}
                                onChange={(e) => setEventEditDraft((prev) => (prev ? { ...prev, description: e.target.value } : prev))}
                                className="w-full border border-[#c4c6d3] px-3 py-2 text-sm min-h-[80px]"
                                placeholder="Event description"
                              />

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-[11px] uppercase tracking-wider text-[#434651] mb-1">Start Time</label>
                                  <input
                                    type="datetime-local"
                                    value={eventEditDraft.startTime}
                                    onChange={(e) => setEventEditDraft((prev) => (prev ? { ...prev, startTime: e.target.value } : prev))}
                                    className="w-full border border-[#c4c6d3] px-3 py-2 text-sm"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] uppercase tracking-wider text-[#434651] mb-1">End Time</label>
                                  <input
                                    type="datetime-local"
                                    value={eventEditDraft.endTime}
                                    onChange={(e) => setEventEditDraft((prev) => (prev ? { ...prev, endTime: e.target.value } : prev))}
                                    className="w-full border border-[#c4c6d3] px-3 py-2 text-sm"
                                  />
                                </div>
                              </div>

                              <p className="text-xs text-[#434651]">
                                Session upload access is managed from the Session Document Upload Locks panel above.
                              </p>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <label className="flex items-center gap-2 text-sm text-[#434651]">
                                  <input
                                    type="checkbox"
                                    checked={eventEditDraft.registrationOpen}
                                    onChange={(e) => setEventEditDraft((prev) => (prev ? { ...prev, registrationOpen: e.target.checked } : prev))}
                                  />
                                  Submissions Open
                                </label>

                                <select
                                  value={eventEditDraft.status}
                                  onChange={(e) =>
                                    setEventEditDraft((prev) =>
                                      prev ? { ...prev, status: e.target.value as InnovationEvent["status"] } : prev
                                    )
                                  }
                                  className="border border-[#c4c6d3] px-3 py-2 text-sm"
                                >
                                  <option value="UPCOMING">UPCOMING</option>
                                  <option value="ACTIVE">ACTIVE</option>
                                  <option value="JUDGING">JUDGING</option>
                                  <option value="CLOSED">CLOSED</option>
                                </select>

                                <input
                                  type="file"
                                  accept=".ppt,.pptx,.pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf"
                                  onChange={(e) =>
                                    setEventEditDraft((prev) =>
                                      prev ? { ...prev, pptFile: e.target.files?.[0] ?? null, removePptFile: false } : prev
                                    )
                                  }
                                  className="border border-[#c4c6d3] px-3 py-2 text-sm"
                                />
                              </div>

                              <label className="flex items-center gap-2 text-xs text-[#434651]">
                                <input
                                  type="checkbox"
                                  checked={eventEditDraft.removePptFile}
                                  onChange={(e) =>
                                    setEventEditDraft((prev) =>
                                      prev ? { ...prev, removePptFile: e.target.checked, pptFile: e.target.checked ? null : prev.pptFile } : prev
                                    )
                                  }
                                />
                                Remove existing event PPT/PDF
                              </label>

                              <div className="border border-[#e3e2df] bg-white p-3 space-y-3">
                                <div className="flex items-center justify-between">
                                  <p className="text-sm font-bold text-[#002155]">Problem Statements</p>
                                  <button
                                    type="button"
                                    onClick={addEventEditorProblem}
                                    className="border border-[#002155] text-[#002155] px-3 py-1 text-xs font-bold uppercase tracking-wider"
                                  >
                                    Add Problem
                                  </button>
                                </div>

                                {eventEditDraft.problems.map((problem, idx) => (
                                  <div key={`edit-problem-${problem.id ?? `new-${idx}`}`} className="border border-[#d8d6cf] p-3 bg-[#faf9f5] space-y-2">
                                    <div className="flex items-center justify-between">
                                      <p className="text-xs uppercase tracking-widest text-[#434651]">Problem #{idx + 1}</p>
                                      <button
                                        type="button"
                                        onClick={() => removeEventEditorProblem(idx)}
                                        className="text-xs font-bold uppercase tracking-wider text-[#ba1a1a]"
                                      >
                                        Remove
                                      </button>
                                    </div>

                                    <input
                                      value={problem.title}
                                      onChange={(e) => updateEventEditorProblem(idx, { title: e.target.value })}
                                      className="w-full border border-[#c4c6d3] px-3 py-2 text-sm"
                                      placeholder="Problem title"
                                    />
                                    <textarea
                                      value={problem.description}
                                      onChange={(e) => updateEventEditorProblem(idx, { description: e.target.value })}
                                      className="w-full border border-[#c4c6d3] px-3 py-2 text-sm min-h-[70px]"
                                      placeholder="Problem description"
                                    />

                                    <div className="space-y-2">
                                      {problem.supportDocumentUrl ? (
                                        <a
                                          href={problem.supportDocumentUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex text-xs font-bold uppercase tracking-wider text-[#8c4f00] underline"
                                        >
                                          View Existing Problem PDF
                                        </a>
                                      ) : null}
                                      <input
                                        type="file"
                                        accept=".pdf,application/pdf"
                                        onChange={(e) =>
                                          updateEventEditorProblem(idx, {
                                            supportDocumentFile: e.target.files?.[0] ?? null,
                                            removeSupportDocument: false,
                                          })
                                        }
                                        className="w-full border border-[#c4c6d3] px-3 py-2 text-sm"
                                      />
                                      {problem.supportDocumentUrl ? (
                                        <label className="flex items-center gap-2 text-xs text-[#434651]">
                                          <input
                                            type="checkbox"
                                            checked={problem.removeSupportDocument}
                                            onChange={(e) =>
                                              updateEventEditorProblem(idx, {
                                                removeSupportDocument: e.target.checked,
                                                supportDocumentFile: e.target.checked ? null : problem.supportDocumentFile,
                                              })
                                            }
                                          />
                                          Remove existing problem PDF
                                        </label>
                                      ) : null}
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                      <label className="flex items-center gap-2 text-sm text-[#434651]">
                                        <input
                                          type="checkbox"
                                          checked={problem.isIndustryProblem}
                                          onChange={(e) =>
                                            updateEventEditorProblem(idx, {
                                              isIndustryProblem: e.target.checked,
                                              industryName: e.target.checked ? problem.industryName : "",
                                            })
                                          }
                                        />
                                        Industry Problem
                                      </label>

                                      {problem.isIndustryProblem ? (
                                        <input
                                          value={problem.industryName}
                                          onChange={(e) => updateEventEditorProblem(idx, { industryName: e.target.value })}
                                          className="w-full border border-[#c4c6d3] px-3 py-2 text-sm"
                                          placeholder="Industry name"
                                        />
                                      ) : null}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => void saveEventEditor()}
                                  disabled={eventEditSaving}
                                  className="bg-[#002155] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
                                >
                                  {eventEditSaving ? "Saving..." : "Save Event Changes"}
                                </button>
                                <button
                                  type="button"
                                  onClick={closeEventEditor}
                                  className="border border-[#747782] text-[#434651] px-4 py-2 text-xs font-bold uppercase tracking-wider"
                                >
                                  Cancel
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

            </>
          ) : null}

          {innovationTab === "review" ? (
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
                    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
                      <div className="space-y-3">
                        {judgingSubmissions.map((claim) => {
                          const rubricDraft = getJudgingRubrics(claim);
                          const liveFinalScore = getRubricTotalScore(rubricDraft);
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
                                <p className="text-xs font-bold uppercase tracking-wider text-[#434651] mb-3">Rubrics (Score Out Of Weight)</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                  {rubricFieldConfig.map((field) => (
                                    <label key={`rubric-${claim.id}-${field.key}`} className="text-xs text-[#434651]">
                                      {field.label} ({field.weight}%)
                                      <input
                                        type="number"
                                        min={0}
                                        max={field.weight}
                                        step={1}
                                        value={rubricDraft[field.key]}
                                        onChange={(e) => updateJudgingRubric(claim.id, field.key, Number(e.target.value))}
                                        className="mt-1 w-full border border-[#c4c6d3] px-2 py-2 text-sm"
                                      />
                                    </label>
                                  ))}
                                </div>
                              </div>

                              <div className="mt-3 border border-[#dce9da] bg-[#f4faf2] px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-bold uppercase tracking-wider text-[#0b6b2e]">Live Final Marks</p>
                                <p className="text-sm font-bold text-[#0b6b2e]">{liveFinalScore}/100</p>
                              </div>
                              {claim.finalScore !== null ? (
                                <p className="mt-1 text-xs text-[#434651]">Saved Final Score: {claim.finalScore}</p>
                              ) : null}

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

                      <aside className="border border-[#c4c6d3] bg-white p-4 xl:sticky xl:top-6">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-[#002155]">Live Leaderboard</h4>
                        <p className="mt-1 text-[11px] text-[#434651]">Updates instantly while entering rubric marks.</p>
                        {liveJudgingLeaderboard.length === 0 ? (
                          <p className="mt-3 text-sm text-[#434651]">No teams with scores yet.</p>
                        ) : (
                          <div className="mt-3 space-y-2">
                            {liveJudgingLeaderboard.map((row) => (
                              <div key={`live-leaderboard-${row.claimId}`} className="border border-[#e3e2df] bg-[#faf9f5] px-3 py-2">
                                <p className="text-xs font-bold text-[#002155]">#{row.rank} {row.teamName}</p>
                                <p className="text-sm font-bold text-[#0b6b2e]">{row.score}/100</p>
                                <p className="text-[11px] text-[#434651]">
                                  {row.hasDraftRubrics ? "Draft (unsynced)" : "Saved"} • {row.status}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </aside>
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
          ) : null}

          {innovationTab === "leaderboard" ? (
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
          ) : null}

          {innovationTab === "analytics" ? (
            <>
          <section className="border border-[#c4c6d3] bg-white p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <div>
                <h2 className="font-headline text-2xl text-[#002155]">Hackathon Analytics</h2>
                <p className="text-sm text-[#434651]">Global filters for participants, teams, attendance, and advanced insights.</p>
              </div>
              <button
                onClick={() => void refreshInnovationAnalytics()}
                className="border border-[#002155] text-[#002155] px-3 py-2 text-xs font-bold uppercase tracking-wider"
              >
                Refresh Analytics
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
              <select
                value={analyticsEventFilter}
                onChange={(e) => {
                  setAnalyticsEventFilter(e.target.value === "ALL" ? "ALL" : Number(e.target.value));
                }}
                className="border border-[#c4c6d3] px-3 py-2 text-sm"
              >
                <option value="ALL">All Events</option>
                {analyticsEventOptions.map((event) => (
                  <option key={`analytics-event-${event.id}`} value={event.id}>
                    #{event.id} {event.title}
                  </option>
                ))}
              </select>

              <select
                value={analyticsProblemFilter}
                onChange={(e) => {
                  setAnalyticsProblemFilter(e.target.value === "ALL" ? "ALL" : Number(e.target.value));
                }}
                className="border border-[#c4c6d3] px-3 py-2 text-sm"
              >
                <option value="ALL">All Problems</option>
                {analyticsProblemOptions.map((problem) => (
                  <option key={`analytics-problem-${problem.id}`} value={problem.id}>
                    #{problem.id} {problem.title}
                  </option>
                ))}
              </select>

              <select
                value={analyticsTeamFilter}
                onChange={(e) => {
                  setAnalyticsTeamFilter(e.target.value === "ALL" ? "ALL" : Number(e.target.value));
                }}
                className="border border-[#c4c6d3] px-3 py-2 text-sm"
              >
                <option value="ALL">All Teams</option>
                {analyticsTeamOptions.map((team) => (
                  <option key={`analytics-team-${team.id}`} value={team.id}>
                    #{team.id} {team.name}
                  </option>
                ))}
              </select>

              <select
                value={analyticsSessionFilter}
                onChange={(e) => setAnalyticsSessionFilter(Math.max(1, Number(e.target.value) || 1))}
                className="border border-[#c4c6d3] px-3 py-2 text-sm"
              >
                {Array.from({ length: analyticsSessionLimit }, (_, index) => {
                  const session = index + 1;
                  return (
                    <option key={`analytics-session-${session}`} value={session}>
                      Session {session}
                    </option>
                  );
                })}
              </select>

              <select
                value={analyticsStageFilter}
                onChange={(e) => setAnalyticsStageFilter(e.target.value as AnalyticsStageFilter)}
                className="border border-[#c4c6d3] px-3 py-2 text-sm"
              >
                <option value="ALL">All Stages</option>
                <option value="SCREENING">SCREENING</option>
                <option value="JUDGING">JUDGING</option>
                <option value="CLOSED">CLOSED</option>
              </select>

              <input
                type="date"
                value={analyticsStartDate}
                onChange={(e) => setAnalyticsStartDate(e.target.value)}
                className="border border-[#c4c6d3] px-3 py-2 text-sm"
              />

              <input
                type="date"
                value={analyticsEndDate}
                onChange={(e) => setAnalyticsEndDate(e.target.value)}
                className="border border-[#c4c6d3] px-3 py-2 text-sm"
              />
            </div>
          </section>

          <section className="border border-[#c4c6d3] bg-white p-3">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setInnovationAnalyticsTab("participants")}
                className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border ${
                  innovationAnalyticsTab === "participants"
                    ? "bg-[#002155] text-white border-[#002155]"
                    : "bg-white text-[#002155] border-[#c4c6d3]"
                }`}
              >
                Participants
              </button>
              <button
                onClick={() => setInnovationAnalyticsTab("teams")}
                className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border ${
                  innovationAnalyticsTab === "teams"
                    ? "bg-[#002155] text-white border-[#002155]"
                    : "bg-white text-[#002155] border-[#c4c6d3]"
                }`}
              >
                Teams
              </button>
              <button
                onClick={() => setInnovationAnalyticsTab("attendance")}
                className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border ${
                  innovationAnalyticsTab === "attendance"
                    ? "bg-[#002155] text-white border-[#002155]"
                    : "bg-white text-[#002155] border-[#c4c6d3]"
                }`}
              >
                Attendance
              </button>
              <button
                onClick={() => setInnovationAnalyticsTab("insights")}
                className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border ${
                  innovationAnalyticsTab === "insights"
                    ? "bg-[#002155] text-white border-[#002155]"
                    : "bg-white text-[#002155] border-[#c4c6d3]"
                }`}
              >
                Insights
              </button>
            </div>
          </section>

          {innovationAnalyticsTab === "participants" ? (
            <section className="border border-[#c4c6d3] bg-white p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <div>
                <h2 className="font-headline text-2xl text-[#002155]">Participant Analytics</h2>
                <p className="text-sm text-[#434651]">Searchable participant table with server-side filters and CSV export.</p>
              </div>
              <button
                onClick={handleExportParticipantCsv}
                className="bg-[#002155] text-white px-3 py-2 text-xs font-bold uppercase tracking-wider"
              >
                Export CSV
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <input
                value={participantSearch}
                onChange={(e) => {
                  setParticipantPage(1);
                  setParticipantSearch(e.target.value);
                }}
                placeholder="Search by member, team, email"
                className="border border-[#c4c6d3] px-3 py-2 text-sm"
              />
              <select
                value={participantStatusFilter}
                onChange={(e) => {
                  setParticipantPage(1);
                  setParticipantStatusFilter(e.target.value as AnalyticsStatusFilter);
                }}
                className="border border-[#c4c6d3] px-3 py-2 text-sm"
              >
                <option value="ALL">All Statuses</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="SUBMITTED">SUBMITTED</option>
                <option value="REVISION_REQUESTED">REVISION_REQUESTED</option>
                <option value="SHORTLISTED">SHORTLISTED</option>
                <option value="ACCEPTED">ACCEPTED</option>
                <option value="REJECTED">REJECTED</option>
              </select>
              <select
                value={participantPageSize}
                onChange={(e) => {
                  setParticipantPage(1);
                  setParticipantPageSize(Number(e.target.value));
                }}
                className="border border-[#c4c6d3] px-3 py-2 text-sm"
              >
                <option value={10}>10 / page</option>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
              </select>
              <div className="border border-[#e3e2df] bg-[#faf9f5] px-3 py-2 text-sm text-[#434651]">
                Avg Score: <span className="font-bold text-[#002155]">{participantData?.summary.averageScore ?? "N/A"}</span>
              </div>
            </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <div className="border border-[#e3e2df] bg-[#faf9f5] p-3">
                <p className="text-[10px] uppercase tracking-widest text-[#434651]">Participants</p>
                <p className="text-xl font-bold text-[#002155]">{participantData?.summary.totalParticipants ?? 0}</p>
              </div>
              <div className="border border-[#e3e2df] bg-[#faf9f5] p-3">
                <p className="text-[10px] uppercase tracking-widest text-[#434651]">Teams</p>
                <p className="text-xl font-bold text-[#002155]">{participantData?.summary.totalTeams ?? 0}</p>
              </div>
              <div className="border border-[#e3e2df] bg-[#faf9f5] p-3">
                <p className="text-[10px] uppercase tracking-widest text-[#434651]">Stage Filter</p>
                <p className="text-xl font-bold text-[#002155]">{analyticsStageFilter}</p>
              </div>
                <div className="border border-[#e3e2df] bg-[#faf9f5] p-3">
                  <p className="text-[10px] uppercase tracking-widest text-[#434651]">Session</p>
                  <p className="text-xl font-bold text-[#002155]">{analyticsSessionFilter}</p>
                </div>
            </div>

            {loadingParticipantData ? (
              <p className="border border-dashed border-[#c4c6d3] bg-[#faf9f5] p-4 text-sm text-[#434651]">Loading participant analytics...</p>
            ) : !participantData || participantData.items.length === 0 ? (
              <p className="border border-dashed border-[#c4c6d3] bg-[#faf9f5] p-4 text-sm text-[#434651]">No participant records for the selected filters.</p>
            ) : (
              <>
                <div className="overflow-x-auto border border-[#c4c6d3]">
                  <table className="w-full text-sm bg-white">
                    <thead className="bg-[#f5f4f0] text-[#434651] uppercase text-xs tracking-wider">
                      <tr>
                        <th className="text-left px-3 py-2">Team Name</th>
                        <th className="text-left px-3 py-2">Team ID / UID</th>
                        <th className="text-left px-3 py-2">Member</th>
                        <th className="text-left px-3 py-2">Role</th>
                        <th className="text-left px-3 py-2">Email</th>
                        <th className="text-left px-3 py-2">Phone</th>
                        <th className="text-left px-3 py-2">Problem</th>
                        <th className="text-left px-3 py-2">Event</th>
                        <th className="text-left px-3 py-2">Status</th>
                        <th className="text-left px-3 py-2">Final Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {participantData.items.map((row) => (
                        <tr key={`participant-analytics-${row.id}`} className="border-t border-[#e3e2df] align-top">
                          <td className="px-3 py-2">{row.teamName}</td>
                          <td className="px-3 py-2">{row.teamIdentifier}</td>
                          <td className="px-3 py-2">{row.memberName}</td>
                          <td className="px-3 py-2">{row.role}</td>
                          <td className="px-3 py-2 break-all">{row.email}</td>
                          <td className="px-3 py-2">{row.phone || "N/A"}</td>
                          <td className="px-3 py-2">{row.problemStatement}</td>
                          <td className="px-3 py-2">{row.eventName}</td>
                          <td className="px-3 py-2">{row.submissionStatus}</td>
                          <td className="px-3 py-2">{row.finalScore ?? "N/A"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between mt-3">
                  <p className="text-xs text-[#434651]">Total: {participantData.total}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setParticipantPage((value) => Math.max(1, value - 1))}
                      disabled={participantPage <= 1 || loadingParticipantData}
                      className="border border-[#c4c6d3] px-3 py-1 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                    >
                      Prev
                    </button>
                    <span className="text-xs text-[#434651]">Page {participantPage}</span>
                    <button
                      onClick={() => {
                        const maxPage = Math.max(1, Math.ceil((participantData.total || 0) / participantPageSize));
                        setParticipantPage((value) => Math.min(maxPage, value + 1));
                      }}
                      disabled={participantPage >= Math.max(1, Math.ceil((participantData.total || 0) / participantPageSize)) || loadingParticipantData}
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

          {innovationAnalyticsTab === "teams" ? (
            <section className="border border-[#c4c6d3] bg-white p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <div>
                <h2 className="font-headline text-2xl text-[#002155]">Team-Level Analytics</h2>
                <p className="text-sm text-[#434651]">Team distribution, acceptance ratio, score quality, and leaderboard snapshot for session {teamData?.selectedSession ?? analyticsSessionFilter}.</p>
              </div>
              <select
                value={analyticsSessionFilter}
                onChange={(e) => setAnalyticsSessionFilter(Math.max(1, Number(e.target.value) || 1))}
                className="border border-[#c4c6d3] px-3 py-2 text-sm w-full md:w-[220px]"
              >
                {Array.from({ length: analyticsSessionLimit }, (_, index) => {
                  const session = index + 1;
                  return (
                    <option key={`teams-session-${session}`} value={session}>
                      Session {session}
                    </option>
                  );
                })}
              </select>
            </div>

            {loadingTeamData ? (
              <p className="border border-dashed border-[#c4c6d3] bg-[#faf9f5] p-4 text-sm text-[#434651]">Loading team analytics...</p>
            ) : !teamData ? (
              <p className="border border-dashed border-[#c4c6d3] bg-[#faf9f5] p-4 text-sm text-[#434651]">No team analytics available.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                  <div className="border border-[#e3e2df] bg-[#faf9f5] p-3">
                    <p className="text-[10px] uppercase tracking-widest text-[#434651]">Total Teams</p>
                    <p className="text-xl font-bold text-[#002155]">{teamData.summary.totalTeamsRegistered}</p>
                  </div>
                  <div className="border border-[#e3e2df] bg-[#faf9f5] p-3">
                    <p className="text-[10px] uppercase tracking-widest text-[#434651]">Shortlisted</p>
                    <p className="text-xl font-bold text-[#002155]">{teamData.summary.shortlistedTeamsCount}</p>
                  </div>
                  <div className="border border-[#e3e2df] bg-[#faf9f5] p-3">
                    <p className="text-[10px] uppercase tracking-widest text-[#434651]">Accepted</p>
                    <p className="text-xl font-bold text-[#0b6b2e]">{teamData.summary.acceptedTeamsCount}</p>
                  </div>
                  <div className="border border-[#e3e2df] bg-[#faf9f5] p-3">
                    <p className="text-[10px] uppercase tracking-widest text-[#434651]">Rejected</p>
                    <p className="text-xl font-bold text-[#ba1a1a]">{teamData.summary.rejectedTeamsCount}</p>
                  </div>
                  <div className="border border-[#e3e2df] bg-[#faf9f5] p-3">
                    <p className="text-[10px] uppercase tracking-widest text-[#434651]">Average Team Score</p>
                    <p className="text-xl font-bold text-[#002155]">{teamData.summary.averageTeamScore ?? "N/A"}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
                  <div className="border border-[#e3e2df] bg-[#faf9f5] p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#002155] mb-3">Teams Per Problem Statement</p>
                    {teamData.teamsPerProblem.length === 0 ? (
                      <p className="text-sm text-[#434651]">No problem-wise team data available.</p>
                    ) : (
                      <div className="space-y-2">
                        {teamData.teamsPerProblem.map((row) => {
                          const max = Math.max(...teamData.teamsPerProblem.map((item) => item.count), 1);
                          const width = Math.max(8, Math.round((row.count / max) * 100));
                          return (
                            <div key={`problem-pop-${row.problemId}`}>
                              <p className="text-xs text-[#434651] mb-1">{row.problemTitle} ({row.count})</p>
                              <div className="h-2 bg-[#e3e2df]">
                                <div className="h-2 bg-[#002155]" style={{ width: `${width}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="border border-[#e3e2df] bg-[#faf9f5] p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#002155] mb-3">Top Performing Teams</p>
                    {teamData.leaderboard.length === 0 ? (
                      <p className="text-sm text-[#434651]">No scored teams available yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {teamData.leaderboard.map((row) => (
                          <div key={`team-leaderboard-${row.teamId}`} className="border border-[#d8d6cf] bg-white p-2">
                            <p className="text-sm font-semibold text-[#002155]">#{row.rank} {row.teamName}</p>
                            <p className="text-xs text-[#434651]">{row.problemTitle} • {row.eventTitle}</p>
                            <p className="text-xs text-[#0b6b2e] font-bold">Score: {row.score}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto border border-[#c4c6d3]">
                  <table className="w-full text-sm bg-white">
                    <thead className="bg-[#f5f4f0] text-[#434651] uppercase text-xs tracking-wider">
                      <tr>
                        <th className="text-left px-3 py-2">Team</th>
                        <th className="text-left px-3 py-2">Problem</th>
                        <th className="text-left px-3 py-2">Status</th>
                        <th className="text-left px-3 py-2">Score</th>
                        <th className="text-left px-3 py-2">Members</th>
                        <th className="text-left px-3 py-2">Attendance %</th>
                        <th className="text-left px-3 py-2">All Sessions</th>
                        <th className="text-left px-3 py-2">Manage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamData.teams.items.map((row) => {
                        const isManaging = teamManagementClaimId === row.teamId;
                        const addMutationKey = `add:${row.teamId}`;

                        return (
                          <Fragment key={`team-analytics-group-${row.teamId}`}>
                            <tr key={`team-analytics-${row.teamId}`} className="border-t border-[#e3e2df]">
                              <td className="px-3 py-2">#{row.teamId} {row.teamName}</td>
                              <td className="px-3 py-2">{row.problemTitle}</td>
                              <td className="px-3 py-2">{row.status}</td>
                              <td className="px-3 py-2">{row.finalScore ?? "N/A"}</td>
                              <td className="px-3 py-2">{row.memberCount}</td>
                              <td className="px-3 py-2">S{row.session}: {row.attendance.attendancePercentage}%</td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-1">
                                  {row.perSessionSummary.map((sessionRow) => (
                                    <span
                                      key={`team-session-snapshot-${row.teamId}-${sessionRow.session}`}
                                      className="text-[10px] border border-[#d8d6cf] bg-[#faf9f5] px-2 py-1 text-[#434651]"
                                    >
                                      S{sessionRow.session}: {sessionRow.presentCount}/{sessionRow.totalMembers}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isManaging) {
                                      setTeamManagementClaimId(null);
                                      setTeamMemberIdentifierInput("");
                                      return;
                                    }

                                    setTeamManagementClaimId(row.teamId);
                                    setTeamMemberIdentifierInput("");
                                  }}
                                  className="border border-[#c4c6d3] px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
                                >
                                  {isManaging ? "Close" : "Manage"}
                                </button>
                              </td>
                            </tr>

                            {isManaging ? (
                              <tr className="border-t border-[#e3e2df] bg-[#faf9f5]" key={`team-manage-${row.teamId}`}>
                                <td colSpan={8} className="px-3 py-3">
                                  <div className="space-y-3">
                                    <div>
                                      <p className="text-xs font-bold uppercase tracking-wider text-[#002155] mb-2">Current Members</p>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {row.members.map((member) => {
                                          const removeKey = `remove:${row.teamId}:${member.claimMemberId}`;
                                          const leadKey = `lead:${row.teamId}:${member.claimMemberId}`;
                                          const isLead = member.role === "LEAD";

                                          return (
                                            <div
                                              key={`team-manage-member-${row.teamId}-${member.claimMemberId}`}
                                              className="border border-[#d8d6cf] bg-white p-2"
                                            >
                                              <p className="text-sm font-semibold text-[#002155]">{member.name}</p>
                                              <p className="text-xs text-[#434651]">{member.uid || member.email}</p>
                                              <p className="text-[11px] text-[#434651] mt-1">
                                                {isLead ? "Lead" : "Member"}
                                              </p>
                                              <div className="flex flex-wrap gap-2 mt-2">
                                                {!isLead ? (
                                                  <button
                                                    type="button"
                                                    onClick={() => void handleSetTeamLead(row.teamId, member.claimMemberId)}
                                                    disabled={teamMemberMutationKey === leadKey}
                                                    className="border border-[#0b6b2e] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#0b6b2e] disabled:opacity-50"
                                                  >
                                                    {teamMemberMutationKey === leadKey ? "Saving" : "Make Lead"}
                                                  </button>
                                                ) : null}
                                                <button
                                                  type="button"
                                                  onClick={() => void handleRemoveTeamMember(row.teamId, member.claimMemberId)}
                                                  disabled={row.members.length <= 1 || teamMemberMutationKey === removeKey}
                                                  className="border border-[#ba1a1a] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#ba1a1a] disabled:opacity-50"
                                                >
                                                  {teamMemberMutationKey === removeKey ? "Removing" : "Remove"}
                                                </button>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>

                                    <div className="border border-[#d8d6cf] bg-white p-3">
                                      <p className="text-xs font-bold uppercase tracking-wider text-[#002155] mb-2">Add Member</p>
                                      <div className="flex flex-col md:flex-row gap-2">
                                        <input
                                          type="text"
                                          value={teamMemberIdentifierInput}
                                          onChange={(e) => setTeamMemberIdentifierInput(e.target.value)}
                                          placeholder="Enter UID or student email"
                                          className="border border-[#c4c6d3] px-3 py-2 text-sm flex-1"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => void handleAddTeamMember(row.teamId)}
                                          disabled={teamMemberMutationKey === addMutationKey}
                                          className="border border-[#002155] bg-[#002155] text-white px-3 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                                        >
                                          {teamMemberMutationKey === addMutationKey ? "Adding" : "Add Member"}
                                        </button>
                                      </div>
                                      <p className="text-[11px] text-[#434651] mt-2">Use UID or active student email. Remove + add can be used to replace members.</p>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between mt-3">
                  <select
                    value={teamAnalyticsPageSize}
                    onChange={(e) => {
                      setTeamAnalyticsPage(1);
                      setTeamAnalyticsPageSize(Number(e.target.value));
                    }}
                    className="border border-[#c4c6d3] px-3 py-1 text-xs"
                  >
                    <option value={10}>10 / page</option>
                    <option value={15}>15 / page</option>
                    <option value={25}>25 / page</option>
                  </select>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setTeamAnalyticsPage((value) => Math.max(1, value - 1))}
                      disabled={teamAnalyticsPage <= 1 || loadingTeamData}
                      className="border border-[#c4c6d3] px-3 py-1 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                    >
                      Prev
                    </button>
                    <span className="text-xs text-[#434651]">Page {teamAnalyticsPage}</span>
                    <button
                      onClick={() => {
                        const total = teamData.teams.total || 0;
                        const maxPage = Math.max(1, Math.ceil(total / teamAnalyticsPageSize));
                        setTeamAnalyticsPage((value) => Math.min(maxPage, value + 1));
                      }}
                      disabled={
                        teamAnalyticsPage >= Math.max(1, Math.ceil((teamData.teams.total || 0) / teamAnalyticsPageSize)) ||
                        loadingTeamData
                      }
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

          {innovationAnalyticsTab === "attendance" ? (
            <section className="border border-[#c4c6d3] bg-white p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <div>
                <h2 className="font-headline text-2xl text-[#002155]">Attendance Tracking Dashboard</h2>
                <p className="text-sm text-[#434651]">Member-level attendance with manual and bulk team marking for session {attendanceData?.selectedSession ?? analyticsSessionFilter}.</p>
              </div>
              <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                <select
                  value={analyticsSessionFilter}
                  onChange={(e) => setAnalyticsSessionFilter(Math.max(1, Number(e.target.value) || 1))}
                  className="border border-[#c4c6d3] px-3 py-2 text-sm w-full md:w-[180px]"
                >
                  {Array.from({ length: analyticsSessionLimit }, (_, index) => {
                    const session = index + 1;
                    return (
                      <option key={`attendance-session-${session}`} value={session}>
                        Session {session}
                      </option>
                    );
                  })}
                </select>
                <input
                  value={attendanceSearch}
                  onChange={(e) => {
                    setAttendancePage(1);
                    setAttendanceSearch(e.target.value);
                  }}
                  placeholder="Search team/member/email"
                  className="border border-[#c4c6d3] px-3 py-2 text-sm w-full md:w-[280px]"
                />
                <button
                  onClick={handleExportAttendanceCsv}
                  className="bg-[#002155] text-white px-3 py-2 text-xs font-bold uppercase tracking-wider"
                >
                  Export Attendance CSV
                </button>
              </div>
            </div>

            {loadingAttendanceData ? (
              <p className="border border-dashed border-[#c4c6d3] bg-[#faf9f5] p-4 text-sm text-[#434651]">Loading attendance dashboard...</p>
            ) : !attendanceData || attendanceData.items.length === 0 ? (
              <p className="border border-dashed border-[#c4c6d3] bg-[#faf9f5] p-4 text-sm text-[#434651]">No attendance records found for selected filters.</p>
            ) : (
              <>
                <div className="mb-3 border border-[#e3e2df] bg-[#faf9f5] p-3 text-sm text-[#434651]">
                  Session {attendanceData.selectedSession}: <span className="font-bold text-[#002155]">{attendanceData.summary.totalPresent}/{attendanceData.summary.totalMembers}</span>
                  <span className="ml-2 font-bold text-[#002155]">({attendanceData.summary.attendancePercentage}%)</span>
                  {allSessionAttendanceSummary ? (
                    <span className="ml-3 text-[#434651]">
                      | All sessions: <span className="font-bold text-[#002155]">{allSessionAttendanceSummary.totalPresent}/{allSessionAttendanceSummary.totalSlots}</span>
                      <span className="ml-1 font-bold text-[#002155]">({allSessionAttendanceSummary.attendancePercentage}%)</span>
                    </span>
                  ) : null}
                </div>

                <div className="space-y-4">
                  {attendanceData.items.map((team) => (
                    <article key={`attendance-team-${team.teamId}`} className="border border-[#d8d6cf] bg-[#faf9f5] p-4">
                      {analyticsSessionFilter > team.totalSessions ? (
                        <p className="mb-2 border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          Session {analyticsSessionFilter} is not configured for this team&apos;s event (max {team.totalSessions}).
                        </p>
                      ) : null}
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-2">
                        <div>
                          <p className="text-sm font-bold text-[#002155]">#{team.teamId} {team.teamName}</p>
                          <p className="text-xs text-[#434651]">{team.problemTitle} • {team.eventTitle}</p>
                          <p className="text-xs text-[#434651]">Session {team.session}/{team.totalSessions} attendance: {team.attendance.presentCount}/{team.attendance.totalMembers} ({team.attendance.attendancePercentage}%)</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => void handleMarkTeamAttendance(team, "PRESENT")}
                            disabled={analyticsSessionFilter > team.totalSessions || attendanceUpdateKey === `team-${team.teamId}-PRESENT-${analyticsSessionFilter}`}
                            className="bg-[#0b6b2e] text-white px-3 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
                          >
                            {attendanceUpdateKey === `team-${team.teamId}-PRESENT-${analyticsSessionFilter}` ? "Saving..." : "Mark Team Present"}
                          </button>
                          <button
                            onClick={() => void handleMarkTeamAttendance(team, "NOT_PRESENT")}
                            disabled={analyticsSessionFilter > team.totalSessions || attendanceUpdateKey === `team-${team.teamId}-NOT_PRESENT-${analyticsSessionFilter}`}
                            className="border border-[#ba1a1a] text-[#ba1a1a] px-3 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-60"
                          >
                            {attendanceUpdateKey === `team-${team.teamId}-NOT_PRESENT-${analyticsSessionFilter}` ? "Saving..." : "Mark Team Not Present"}
                          </button>
                        </div>
                      </div>

                      <div className="mb-2 flex flex-wrap gap-2">
                        {team.perSessionSummary.map((row) => (
                          <span key={`team-${team.teamId}-session-summary-${row.session}`} className="text-[10px] border border-[#d8d6cf] bg-white px-2 py-1 text-[#434651]">
                            S{row.session}: {row.presentCount}/{row.totalMembers}
                          </span>
                        ))}
                      </div>

                      <div className="overflow-x-auto border border-[#e3e2df] bg-white">
                        <table className="w-full text-xs">
                          <thead className="bg-[#f5f4f0] text-[#434651] uppercase tracking-wider">
                            <tr>
                              <th className="text-left px-3 py-2">Member</th>
                              <th className="text-left px-3 py-2">Email</th>
                              <th className="text-left px-3 py-2">Phone</th>
                              <th className="text-left px-3 py-2">Status</th>
                              <th className="text-left px-3 py-2">Marked Time</th>
                              <th className="text-left px-3 py-2">Marked By</th>
                              <th className="text-left px-3 py-2">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {team.members.map((member) => {
                              const targetStatus = member.attendanceStatus === "PRESENT" ? "NOT_PRESENT" : "PRESENT";
                              const actionKey = `member-${team.teamId}-${member.claimMemberId}-${targetStatus}-${analyticsSessionFilter}`;

                              return (
                                <tr key={`attendance-member-${member.claimMemberId}`} className="border-t border-[#e3e2df]">
                                  <td className="px-3 py-2">{member.name} ({member.role})</td>
                                  <td className="px-3 py-2">{member.email}</td>
                                  <td className="px-3 py-2">{member.phone || "N/A"}</td>
                                  <td className="px-3 py-2">{member.attendanceStatus}</td>
                                  <td className="px-3 py-2">{member.markedTime ? new Date(member.markedTime).toLocaleString() : "N/A"}</td>
                                  <td className="px-3 py-2">{member.markedBy ? member.markedBy.name : "N/A"}</td>
                                  <td className="px-3 py-2">
                                    <button
                                      onClick={() => void handleMarkMemberAttendance(team.teamId, member.userId, member.claimMemberId, targetStatus)}
                                      disabled={analyticsSessionFilter > team.totalSessions || attendanceUpdateKey === actionKey}
                                      className="border border-[#002155] text-[#002155] px-2 py-1 text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
                                    >
                                      {attendanceUpdateKey === actionKey
                                        ? "Saving..."
                                        : member.attendanceStatus === "PRESENT"
                                          ? "Mark Not Present"
                                          : "Mark Present"}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="flex items-center justify-between mt-3">
                  <select
                    value={attendancePageSize}
                    onChange={(e) => {
                      setAttendancePage(1);
                      setAttendancePageSize(Number(e.target.value));
                    }}
                    className="border border-[#c4c6d3] px-3 py-1 text-xs"
                  >
                    <option value={5}>5 / page</option>
                    <option value={8}>8 / page</option>
                    <option value={12}>12 / page</option>
                  </select>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAttendancePage((value) => Math.max(1, value - 1))}
                      disabled={attendancePage <= 1 || loadingAttendanceData}
                      className="border border-[#c4c6d3] px-3 py-1 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                    >
                      Prev
                    </button>
                    <span className="text-xs text-[#434651]">Page {attendancePage}</span>
                    <button
                      onClick={() => {
                        const maxPage = Math.max(1, Math.ceil((attendanceData.total || 0) / attendancePageSize));
                        setAttendancePage((value) => Math.min(maxPage, value + 1));
                      }}
                      disabled={attendancePage >= Math.max(1, Math.ceil((attendanceData.total || 0) / attendancePageSize)) || loadingAttendanceData}
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

          {innovationAnalyticsTab === "insights" ? (
            <section className="border border-[#c4c6d3] bg-white p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
              <div>
                <h2 className="font-headline text-2xl text-[#002155]">Advanced Analytics Insights</h2>
                <span className="text-xs uppercase tracking-widest text-[#434651] font-label">Trends, drop-off, scoring, correlation</span>
              </div>
              <select
                value={analyticsSessionFilter}
                onChange={(e) => setAnalyticsSessionFilter(Math.max(1, Number(e.target.value) || 1))}
                className="border border-[#c4c6d3] px-3 py-2 text-sm w-full md:w-[180px]"
              >
                {Array.from({ length: analyticsSessionLimit }, (_, index) => {
                  const session = index + 1;
                  return (
                    <option key={`insights-session-${session}`} value={session}>
                      Session {session}
                    </option>
                  );
                })}
              </select>
            </div>

            {loadingInsightsData ? (
              <p className="border border-dashed border-[#c4c6d3] bg-[#faf9f5] p-4 text-sm text-[#434651]">Loading advanced insights...</p>
            ) : !insightsData ? (
              <p className="border border-dashed border-[#c4c6d3] bg-[#faf9f5] p-4 text-sm text-[#434651]">No insight data available for the selected filters.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className="border border-[#e3e2df] bg-[#faf9f5] p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#002155] mb-3">Participation Trends (Teams Over Time)</p>
                    {insightsData.participationTrends.length === 0 ? (
                      <p className="text-sm text-[#434651]">No trend points available.</p>
                    ) : (
                      <div className="space-y-2">
                        {insightsData.participationTrends.map((point) => {
                          const max = Math.max(...insightsData.participationTrends.map((item) => item.teams), 1);
                          const width = Math.max(8, Math.round((point.teams / max) * 100));
                          return (
                            <div key={`trend-${point.date}`}>
                              <p className="text-xs text-[#434651] mb-1">{point.date} ({point.teams})</p>
                              <div className="h-2 bg-[#e3e2df]">
                                <div className="h-2 bg-[#002155]" style={{ width: `${width}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="border border-[#e3e2df] bg-[#faf9f5] p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#002155] mb-3">Problem Statement Popularity</p>
                    {insightsData.problemPopularity.length === 0 ? (
                      <p className="text-sm text-[#434651]">No popularity data available.</p>
                    ) : (
                      <div className="space-y-2">
                        {insightsData.problemPopularity.map((row) => {
                          const max = Math.max(...insightsData.problemPopularity.map((item) => item.teams), 1);
                          const width = Math.max(8, Math.round((row.teams / max) * 100));
                          return (
                            <div key={`popularity-${row.problemId}`}>
                              <p className="text-xs text-[#434651] mb-1">{row.problemTitle} ({row.teams})</p>
                              <div className="h-2 bg-[#e3e2df]">
                                <div className="h-2 bg-[#8c4f00]" style={{ width: `${width}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <div className="border border-[#e3e2df] bg-[#faf9f5] p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#002155] mb-2">Drop-off Funnel</p>
                    <p className="text-sm text-[#434651]">Registered: <span className="font-bold text-[#002155]">{insightsData.dropOffRate.registered}</span></p>
                    <p className="text-sm text-[#434651]">Submitted: <span className="font-bold text-[#002155]">{insightsData.dropOffRate.submitted}</span></p>
                    <p className="text-sm text-[#434651]">Shortlisted: <span className="font-bold text-[#002155]">{insightsData.dropOffRate.shortlisted}</span></p>
                    <p className="text-sm text-[#434651]">Accepted: <span className="font-bold text-[#0b6b2e]">{insightsData.dropOffRate.accepted}</span></p>
                    <p className="mt-2 text-xs text-[#434651]">Submitted/Registered: {insightsData.dropOffRate.percentages.submittedFromRegistered}%</p>
                    <p className="text-xs text-[#434651]">Shortlisted/Registered: {insightsData.dropOffRate.percentages.shortlistedFromRegistered}%</p>
                    <p className="text-xs text-[#434651]">Accepted/Registered: {insightsData.dropOffRate.percentages.acceptedFromRegistered}%</p>
                  </div>

                  <div className="border border-[#e3e2df] bg-[#faf9f5] p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#002155] mb-2">Judge Scoring Distribution</p>
                    <div className="space-y-2">
                      {insightsData.judgeScoringDistribution.scoreBins.map((bin) => {
                        const max = Math.max(...insightsData.judgeScoringDistribution.scoreBins.map((item) => item.teams), 1);
                        const width = Math.max(8, Math.round((bin.teams / max) * 100));
                        return (
                          <div key={`score-bin-${bin.range}`}>
                            <p className="text-xs text-[#434651] mb-1">{bin.range} ({bin.teams})</p>
                            <div className="h-2 bg-[#e3e2df]">
                              <div className="h-2 bg-[#0b6b2e]" style={{ width: `${width}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border border-[#e3e2df] bg-[#faf9f5] p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#002155] mb-2">Attendance vs Performance</p>
                    <p className="text-sm text-[#434651]">Selected Session: <span className="font-bold text-[#002155]">{insightsData.selectedSession}</span></p>
                    <p className="text-sm text-[#434651]">Correlation: <span className="font-bold text-[#002155]">{insightsData.attendanceVsPerformance.correlation ?? "N/A"}</span></p>
                    <p className="text-sm text-[#434651]">Sample Size: <span className="font-bold text-[#002155]">{insightsData.attendanceVsPerformance.sampleSize}</span></p>
                    <div className="mt-2 space-y-1 text-xs text-[#434651]">
                      <p>Low (&lt;50%): {insightsData.attendanceVsPerformance.bucketAverages.lowAttendance.averageScore ?? "N/A"}</p>
                      <p>Medium (50-79%): {insightsData.attendanceVsPerformance.bucketAverages.mediumAttendance.averageScore ?? "N/A"}</p>
                      <p>High (80-100%): {insightsData.attendanceVsPerformance.bucketAverages.highAttendance.averageScore ?? "N/A"}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className="border border-[#e3e2df] bg-[#faf9f5] p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#002155] mb-2">Session Attendance Trend</p>
                    {insightsData.attendancePerSession.length === 0 ? (
                      <p className="text-sm text-[#434651]">No session attendance records available.</p>
                    ) : (
                      <div className="space-y-2">
                        {insightsData.attendancePerSession.map((row) => {
                          const max = Math.max(...insightsData.attendancePerSession.map((item) => item.attendancePercentage), 1);
                          const width = Math.max(8, Math.round((row.attendancePercentage / max) * 100));

                          return (
                            <div key={`insight-attendance-session-${row.session}`}>
                              <p className="text-xs text-[#434651] mb-1">
                                Session {row.session}: {row.presentCount}/{row.totalMembers} ({row.attendancePercentage}%)
                              </p>
                              <div className="h-2 bg-[#e3e2df]">
                                <div className="h-2 bg-[#002155]" style={{ width: `${width}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="border border-[#e3e2df] bg-[#faf9f5] p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#002155] mb-2">Average Scores By Problem</p>
                    {insightsData.averageScoresByProblem.length === 0 ? (
                      <p className="text-sm text-[#434651]">No scored problem data available.</p>
                    ) : (
                      <div className="space-y-2">
                        {insightsData.averageScoresByProblem.map((row) => (
                          <div key={`avg-problem-${row.problemId}`} className="border border-[#d8d6cf] bg-white p-2">
                            <p className="text-xs text-[#434651]">{row.problemTitle}</p>
                            <p className="text-sm font-bold text-[#002155]">Avg: {row.averageScore} ({row.scoredTeams} scored teams)</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border border-[#e3e2df] bg-[#faf9f5] p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#002155] mb-2">Rubric Averages</p>
                    <div className="space-y-2">
                      {insightsData.judgeScoringDistribution.rubricAverages.map((rubric) => (
                        <div key={`rubric-avg-${rubric.rubric}`} className="border border-[#d8d6cf] bg-white p-2">
                          <p className="text-xs text-[#434651]">{rubric.rubric.toUpperCase()}</p>
                          <p className="text-sm font-bold text-[#002155]">{rubric.average ?? "N/A"} / 10</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className="border border-[#e3e2df] bg-[#faf9f5] p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#002155] mb-2">Session-to-Session Drop-off</p>
                    {insightsData.sessionDropOff.length === 0 ? (
                      <p className="text-sm text-[#434651]">At least two sessions are required to compute drop-off.</p>
                    ) : (
                      <div className="space-y-2">
                        {insightsData.sessionDropOff.map((row) => (
                          <div key={`session-drop-${row.fromSession}-${row.toSession}`} className="border border-[#d8d6cf] bg-white p-2">
                            <p className="text-xs text-[#434651]">S{row.fromSession} to S{row.toSession}</p>
                            <p className="text-sm font-bold text-[#002155]">{row.dropOffCount} team drop ({row.dropOffRate}%)</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border border-[#e3e2df] bg-[#faf9f5] p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#002155] mb-2">Teams Missing Sessions</p>
                    <p className="text-xs text-[#434651] mb-2">
                      Avg consistency: <span className="font-bold text-[#002155]">{insightsData.attendanceConsistency.averageConsistency ?? "N/A"}%</span>
                    </p>
                    {insightsData.teamsMissingSpecificSessions.length === 0 ? (
                      <p className="text-sm text-[#434651]">No teams are missing required sessions.</p>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-auto">
                        {insightsData.teamsMissingSpecificSessions.map((row) => (
                          <div key={`missing-session-team-${row.teamId}`} className="border border-[#d8d6cf] bg-white p-2">
                            <p className="text-sm font-semibold text-[#002155]">{row.teamName}</p>
                            <p className="text-xs text-[#434651]">Missing: {row.missingSessions.join(", ")}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
          ) : null}
            </>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
