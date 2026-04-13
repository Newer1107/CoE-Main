import { dispatchEmail, sendEmail } from '@/lib/email-delivery';
import prisma from '@/lib/prisma';
import { HACKATHON_RUBRIC_WEIGHTS } from '@/lib/hackathon-scoring';

const appBaseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const innovationEventsUrl = `${appBaseUrl}/innovation/events`;
const innovationProblemsUrl = `${appBaseUrl}/innovation/problems`;
const innovationMyApplicationsUrl = `${appBaseUrl}/innovation/my-applications`;
const innovationMySubmissionsUrl = `${appBaseUrl}/innovation/my-submissions`;
const innovationFacultyUrl = `${appBaseUrl}/innovation/faculty`;

const brandHeader = `
  <div style="background:#002155;padding:16px 24px;text-align:center;">
    <h1 style="margin:0;color:#ffffff;font-family:'Helvetica Neue',Arial,sans-serif;font-size:20px;letter-spacing:2px;">TCET CENTER OF EXCELLENCE</h1>
    <div style="height:4px;background:#F7941D;margin-top:8px;"></div>
  </div>
`;

const brandFooter = `
  <div style="background:#f5f4f0;padding:16px 24px;text-align:center;font-size:11px;color:#747782;font-family:Arial,sans-serif;">
    <p style="margin:0;">Thakur College of Engineering &amp; Technology, Kandivali (E), Mumbai - 400101</p>
    <p style="margin:4px 0 0;">&copy; 2026 TCET Center of Excellence. All Rights Reserved.</p>
  </div>
`;

const wrap = (body: string) => `
<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#faf9f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:24px auto;border:1px solid #c4c6d3;overflow:hidden;">
    ${brandHeader}
    <div style="padding:24px;background:#ffffff;">${body}</div>
    ${brandFooter}
  </div>
</body></html>`;

const formatEmailDateTime = (value: string | Date | null | undefined) => {
  if (!value) return 'N/A';
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(parsed);
};

const send = async (
  to: string | string[],
  subject: string,
  htmlBody: string,
  options?: { mode?: 'immediate' | 'bulk'; category?: string; dedupeKey?: string }
) => {
  await dispatchEmail({
    to,
    subject,
    html: wrap(htmlBody),
    mode: options?.mode || 'immediate',
    category: options?.category || 'GENERAL',
    dedupeKey: options?.dedupeKey,
  });
};

// ─── 1. OTP ───
export const sendOTPEmail = async (email: string, otp: string) => {
  const body = `
    <h2 style="color:#002155;margin:0 0 8px;">Verify Your CoE Account</h2>
    <p style="color:#434651;font-size:14px;">Use the following One-Time Password to complete your registration:</p>
    <div style="background:#f5f4f0;border-left:4px solid #F7941D;padding:16px 24px;margin:16px 0;text-align:center;">
      <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#002155;">${otp}</span>
    </div>
    <p style="color:#747782;font-size:12px;">This code is valid for <strong>10 minutes</strong>. Do not share it with anyone.</p>`;
  await send(email, `Verify your TCET CoE account — OTP: ${otp}`, body, {
    mode: 'immediate',
    category: 'AUTH_OTP',
  });
};

export const sendPasswordResetOTPEmail = async (email: string, otp: string) => {
  const body = `
    <h2 style="color:#002155;margin:0 0 8px;">Reset Your CoE Account Password</h2>
    <p style="color:#434651;font-size:14px;">Use the following One-Time Password to reset your account password:</p>
    <div style="background:#f5f4f0;border-left:4px solid #F7941D;padding:16px 24px;margin:16px 0;text-align:center;">
      <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#002155;">${otp}</span>
    </div>
    <p style="color:#747782;font-size:12px;">This code is valid for <strong>10 minutes</strong>. If you did not request this reset, you can ignore this email.</p>`;
  await send(email, `Reset your TCET CoE password — OTP: ${otp}`, body, {
    mode: 'immediate',
    category: 'AUTH_PASSWORD_RESET_OTP',
  });
};

interface BookingDetails {
  id: number;
  studentName?: string;
  date: string;
  timeSlot: string;
  lab: string;
  facilities: string[] | string;
}

// ─── 2. Booking Confirmation ───
export const sendBookingConfirmationEmail = async (email: string, b: BookingDetails) => {
  const facilities = Array.isArray(b.facilities) ? b.facilities.join(', ') : b.facilities;
  const body = `
    <h2 style="color:#002155;margin:0 0 8px;">Your CoE Facility Booking is Confirmed</h2>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
      <tr style="border-bottom:1px solid #c4c6d3;"><td style="padding:8px;color:#747782;font-weight:bold;">Booking ID</td><td style="padding:8px;color:#002155;">${b.id}</td></tr>
      <tr style="border-bottom:1px solid #c4c6d3;background:#f5f4f0;"><td style="padding:8px;color:#747782;font-weight:bold;">Name</td><td style="padding:8px;color:#002155;">${b.studentName}</td></tr>
      <tr style="border-bottom:1px solid #c4c6d3;"><td style="padding:8px;color:#747782;font-weight:bold;">Date</td><td style="padding:8px;color:#002155;">${b.date}</td></tr>
      <tr style="border-bottom:1px solid #c4c6d3;background:#f5f4f0;"><td style="padding:8px;color:#747782;font-weight:bold;">Time Slot</td><td style="padding:8px;color:#002155;">${b.timeSlot}</td></tr>
      <tr style="border-bottom:1px solid #c4c6d3;"><td style="padding:8px;color:#747782;font-weight:bold;">Lab</td><td style="padding:8px;color:#002155;">${b.lab}</td></tr>
      <tr style="background:#f5f4f0;"><td style="padding:8px;color:#747782;font-weight:bold;">Facilities</td><td style="padding:8px;color:#002155;">${facilities}</td></tr>
    </table>`;
  await send(email, 'Your CoE Facility Booking is Confirmed', body, {
    mode: 'immediate',
    category: 'BOOKING_CONFIRMED',
  });
};

// ─── 3. Booking Rejection ───
export const sendBookingRejectionEmail = async (email: string, b: BookingDetails, reason?: string) => {
  const body = `
    <h2 style="color:#002155;margin:0 0 8px;">Facility Booking Rejected</h2>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
      <tr style="border-bottom:1px solid #c4c6d3;"><td style="padding:8px;color:#747782;font-weight:bold;">Booking ID</td><td style="padding:8px;">${b.id}</td></tr>
      <tr style="border-bottom:1px solid #c4c6d3;background:#f5f4f0;"><td style="padding:8px;color:#747782;font-weight:bold;">Date</td><td style="padding:8px;">${b.date}</td></tr>
      <tr><td style="padding:8px;color:#747782;font-weight:bold;">Time Slot</td><td style="padding:8px;">${b.timeSlot}</td></tr>
    </table>
    <div style="background:#ffdad6;border-left:4px solid #ba1a1a;padding:12px 16px;margin:16px 0;">
      <p style="margin:0;color:#93000a;font-weight:bold;font-size:12px;">REASON</p>
      <p style="margin:4px 0 0;color:#434651;">${reason || 'No specific reason provided.'}</p>
    </div>`;
  await send(email, 'Facility Booking Rejected — TCET CoE', body, {
    mode: 'immediate',
    category: 'BOOKING_REJECTED',
  });
};

// ─── 4. Booking Reminder ───
export const sendBookingReminderEmail = async (email: string, b: BookingDetails) => {
  const facilities = Array.isArray(b.facilities) ? b.facilities.join(', ') : b.facilities;
  const body = `
    <h2 style="color:#002155;margin:0 0 8px;">⏰ Your Lab Booking Starts in 30 Minutes</h2>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
      <tr style="border-bottom:1px solid #c4c6d3;"><td style="padding:8px;color:#747782;font-weight:bold;">Lab</td><td style="padding:8px;color:#002155;">${b.lab}</td></tr>
      <tr style="border-bottom:1px solid #c4c6d3;background:#f5f4f0;"><td style="padding:8px;color:#747782;font-weight:bold;">Time Slot</td><td style="padding:8px;color:#002155;">${b.timeSlot}</td></tr>
      <tr><td style="padding:8px;color:#747782;font-weight:bold;">Facilities</td><td style="padding:8px;color:#002155;">${facilities}</td></tr>
    </table>
    <p style="color:#8c4f00;font-size:13px;font-weight:bold;">Please carry your valid Institutional ID card.</p>`;
  await send(email, '⏰ Reminder: Your CoE lab booking starts in 30 minutes', body, {
    mode: 'immediate',
    category: 'BOOKING_REMINDER',
  });
};

// ─── 5. Faculty Pending (to Admin) ───
export const sendFacultyPendingNotification = async (adminEmail: string, f: { name: string; email: string }) => {
  const body = `
    <h2 style="color:#002155;margin:0 0 8px;">New Faculty Registration Pending</h2>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
      <tr style="border-bottom:1px solid #c4c6d3;"><td style="padding:8px;color:#747782;font-weight:bold;">Name</td><td style="padding:8px;color:#002155;">${f.name}</td></tr>
      <tr style="background:#f5f4f0;"><td style="padding:8px;color:#747782;font-weight:bold;">Email</td><td style="padding:8px;color:#002155;">${f.email}</td></tr>
    </table>
    <p style="color:#434651;font-size:13px;">Please log into the admin panel to approve or reject this account.</p>`;
  await send(adminEmail, 'New Faculty Account Pending Approval — TCET CoE', body, {
    mode: 'immediate',
    category: 'FACULTY_PENDING',
  });
};

// ─── 6. Faculty Approved ───
export const sendFacultyApprovalEmail = async (email: string, name: string) => {
  const body = `
    <h2 style="color:#002155;margin:0 0 8px;">Account Approved</h2>
    <p style="color:#434651;font-size:14px;">Dear <strong>${name}</strong>,</p>
    <p style="color:#434651;font-size:14px;">Your CoE faculty account has been approved. You may now log in and access all faculty features.</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/facility-booking" style="background:#002155;color:#ffffff;padding:12px 32px;text-decoration:none;font-weight:bold;font-size:14px;letter-spacing:1px;">LOG IN NOW</a>
    </div>`;
  await send(email, 'Your CoE Faculty Account is Approved', body, {
    mode: 'immediate',
    category: 'FACULTY_APPROVED',
  });
};

// ─── 7. Faculty Rejected ───
export const sendFacultyRejectionEmail = async (email: string, name: string) => {
  const body = `
    <h2 style="color:#002155;margin:0 0 8px;">Account Registration Rejected</h2>
    <p style="color:#434651;font-size:14px;">Dear <strong>${name}</strong>,</p>
    <p style="color:#434651;font-size:14px;">Your faculty account registration for the TCET Center of Excellence has been rejected. Please contact the CoE office if you believe this is an error.</p>`;
  await send(email, 'Faculty Account Registration Rejected — TCET CoE', body, {
    mode: 'immediate',
    category: 'FACULTY_REJECTED',
  });
};

// ─── 8. Innovation: Problem Claimed ───
export const sendInnovationProblemClaimedEmail = async (
  facultyEmail: string,
  details: {
    problemTitle: string;
    teamName?: string | null;
    claimedBy: string;
  }
) => {
  const body = `
    <h2 style="color:#002155;margin:0 0 8px;">A Student Team Claimed Your Problem</h2>
    <p style="color:#434651;font-size:14px;">Problem: <strong>${details.problemTitle}</strong></p>
    <p style="color:#434651;font-size:14px;">Claimed by: <strong>${details.claimedBy}</strong></p>
    <p style="color:#434651;font-size:14px;">Team: <strong>${details.teamName || 'Individual'}</strong></p>
    <div style="text-align:center;margin:20px 0;">
      <a href="${innovationFacultyUrl}" style="background:#002155;color:#ffffff;padding:12px 28px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px;display:inline-block;">Review In Faculty Workspace</a>
    </div>
    <p style="color:#747782;font-size:12px;">Open the faculty workspace to review claim details and provide feedback.</p>`;

  await send(facultyEmail, 'Innovation Update: Problem Claimed', body, {
    mode: 'immediate',
    category: 'INNOVATION_PROBLEM_CLAIMED',
  });
};

// ─── 9. Innovation: Claim Reviewed ───
export const sendInnovationClaimReviewEmail = async (
  recipients: string[],
  details: {
    problemTitle: string;
    status: 'ACCEPTED' | 'REVISION_REQUESTED' | 'REJECTED';
    score?: number | null;
    feedback?: string | null;
  }
) => {
  const body = `
    <h2 style="color:#002155;margin:0 0 8px;">Submission Review Result</h2>
    <p style="color:#434651;font-size:14px;">Problem: <strong>${details.problemTitle}</strong></p>
    <p style="color:#434651;font-size:14px;">Status: <strong>${details.status.replaceAll('_', ' ')}</strong></p>
    <p style="color:#434651;font-size:14px;">Score: <strong>${details.score ?? 'Not assigned'}</strong></p>
    <div style="background:#f5f4f0;border-left:4px solid #F7941D;padding:12px 16px;margin:16px 0;">
      <p style="margin:0;color:#434651;">Feedback:</p>
      <p style="margin:4px 0 0;color:#002155;">${details.feedback || 'No feedback shared.'}</p>
    </div>
    <div style="text-align:center;margin:20px 0;">
      <a href="${innovationMySubmissionsUrl}" style="background:#002155;color:#ffffff;padding:12px 28px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px;display:inline-block;">View My Submission</a>
    </div>`;

  await send(recipients, 'Innovation Submission Review Update', body, {
    mode: 'immediate',
    category: 'INNOVATION_CLAIM_REVIEW',
  });
};

// ─── 9a. Innovation: Hackathon Screening Result ───
export const sendInnovationScreeningResultEmail = async (
  recipients: string[],
  details: {
    eventTitle: string;
    problemTitle: string;
    status: 'SHORTLISTED' | 'REJECTED';
  }
) => {
  const statusLine =
    details.status === 'SHORTLISTED'
      ? 'SHORTLISTED for the Judging Round'
      : 'NOT SHORTLISTED after PPT Screening';

  const body = `
    <h2 style="color:#002155;margin:0 0 8px;">PPT Screening Result</h2>
    <p style="color:#434651;font-size:14px;">Event: <strong>${details.eventTitle}</strong></p>
    <p style="color:#434651;font-size:14px;">Problem: <strong>${details.problemTitle}</strong></p>
    <p style="color:#434651;font-size:14px;">Result: <strong>${statusLine}</strong></p>
    <div style="text-align:center;margin:20px 0;">
      <a href="${innovationEventsUrl}" style="background:#002155;color:#ffffff;padding:12px 28px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px;display:inline-block;">Open Event Details</a>
    </div>`;

  await send(recipients, 'Hackathon PPT Screening Result', body, {
    mode: 'bulk',
    category: 'HACKATHON_SCREENING_RESULT',
  });
};

// ─── 9b. Innovation: Hackathon Rubric Result ───
export const sendInnovationRubricScoreEmail = async (
  recipients: string[],
  details: {
    eventTitle: string;
    problemTitle: string;
    status: 'ACCEPTED' | 'REJECTED';
    rubrics: {
      innovation: number;
      technical: number;
      impact: number;
      ux: number;
      execution: number;
      presentation: number;
      feasibility: number;
    };
    finalScore: number;
  }
) => {
  const body = `
    <h2 style="color:#002155;margin:0 0 8px;">Hackathon Evaluation Scorecard</h2>
    <p style="color:#434651;font-size:14px;">Event: <strong>${details.eventTitle}</strong></p>
    <p style="color:#434651;font-size:14px;">Problem: <strong>${details.problemTitle}</strong></p>
    <p style="color:#434651;font-size:14px;">Result: <strong>${details.status}</strong></p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
      <tr style="border-bottom:1px solid #c4c6d3;"><td style="padding:8px;color:#747782;font-weight:bold;">Innovation</td><td style="padding:8px;color:#002155;">${details.rubrics.innovation}/${HACKATHON_RUBRIC_WEIGHTS.innovation}</td></tr>
      <tr style="border-bottom:1px solid #c4c6d3;background:#f5f4f0;"><td style="padding:8px;color:#747782;font-weight:bold;">Technical</td><td style="padding:8px;color:#002155;">${details.rubrics.technical}/${HACKATHON_RUBRIC_WEIGHTS.technical}</td></tr>
      <tr style="border-bottom:1px solid #c4c6d3;"><td style="padding:8px;color:#747782;font-weight:bold;">Impact</td><td style="padding:8px;color:#002155;">${details.rubrics.impact}/${HACKATHON_RUBRIC_WEIGHTS.impact}</td></tr>
      <tr style="border-bottom:1px solid #c4c6d3;background:#f5f4f0;"><td style="padding:8px;color:#747782;font-weight:bold;">UX</td><td style="padding:8px;color:#002155;">${details.rubrics.ux}/${HACKATHON_RUBRIC_WEIGHTS.ux}</td></tr>
      <tr style="border-bottom:1px solid #c4c6d3;"><td style="padding:8px;color:#747782;font-weight:bold;">Execution</td><td style="padding:8px;color:#002155;">${details.rubrics.execution}/${HACKATHON_RUBRIC_WEIGHTS.execution}</td></tr>
      <tr style="border-bottom:1px solid #c4c6d3;background:#f5f4f0;"><td style="padding:8px;color:#747782;font-weight:bold;">Presentation</td><td style="padding:8px;color:#002155;">${details.rubrics.presentation}/${HACKATHON_RUBRIC_WEIGHTS.presentation}</td></tr>
      <tr style="border-bottom:1px solid #c4c6d3;"><td style="padding:8px;color:#747782;font-weight:bold;">Feasibility</td><td style="padding:8px;color:#002155;">${details.rubrics.feasibility}/${HACKATHON_RUBRIC_WEIGHTS.feasibility}</td></tr>
      <tr style="background:#f5f4f0;"><td style="padding:8px;color:#747782;font-weight:bold;">Final Score</td><td style="padding:8px;color:#002155;"><strong>${details.finalScore}/100</strong></td></tr>
    </table>
    <div style="text-align:center;margin:20px 0;">
      <a href="${innovationEventsUrl}" style="background:#002155;color:#ffffff;padding:12px 28px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px;display:inline-block;">View Event & Leaderboard</a>
    </div>`;

  await send(recipients, 'Hackathon Evaluation Result', body, {
    mode: 'bulk',
    category: 'HACKATHON_JUDGING_RESULT',
  });
};

// ─── 10. Innovation: Event Ending Reminder ───
export const sendInnovationEventReminderEmail = async (
  recipients: string[],
  details: {
    eventTitle: string;
    endTime: string;
  }
) => {
  const endTimeText = formatEmailDateTime(details.endTime);
  const body = `
    <h2 style="color:#002155;margin:0 0 8px;">Hackathon Reminder: 30 Minutes Left</h2>
    <p style="color:#434651;font-size:14px;">Your event <strong>${details.eventTitle}</strong> is closing soon.</p>
    <p style="color:#434651;font-size:14px;">Submission lock time: <strong>${endTimeText}</strong></p>
    <div style="text-align:center;margin:20px 0;">
      <a href="${innovationEventsUrl}" style="background:#002155;color:#ffffff;padding:12px 28px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px;display:inline-block;">Submit / Check Event</a>
    </div>`;

  await send(recipients, 'Innovation Reminder: 30 Minutes Remaining', body, {
    mode: 'bulk',
    category: 'HACKATHON_EVENT_REMINDER',
  });
};

// ─── 11. Innovation: Event Became Active ───
export const sendInnovationEventActiveEmail = async (
  recipients: string[],
  details: {
    eventTitle: string;
  }
) => {
  const body = `
    <h2 style="color:#002155;margin:0 0 8px;">Hackathon Status Updated: Active</h2>
    <p style="color:#434651;font-size:14px;">The event <strong>${details.eventTitle}</strong> is now active.</p>
    <p style="color:#434651;font-size:14px;">Final judging is now open during the active phase. Results are announced when the event is closed.</p>
    <div style="text-align:center;margin:20px 0;">
      <a href="${innovationEventsUrl}" style="background:#002155;color:#ffffff;padding:12px 28px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px;display:inline-block;">Open Active Event</a>
    </div>`;

  await send(recipients, 'Innovation Update: Event Is Active', body, {
    mode: 'bulk',
    category: 'HACKATHON_EVENT_ACTIVE',
  });
};

// ─── 11a. Innovation: Upcoming Event Broadcast (All Active Students) ───
export const sendInnovationEventUpcomingBroadcastEmail = async (
  recipients: string[],
  details: {
    eventTitle: string;
    startTime: string;
  }
) => {
  const startTimeText = formatEmailDateTime(details.startTime);
  const body = `
    <h2 style="color:#002155;margin:0 0 8px;">New Upcoming Hackathon</h2>
    <p style="color:#434651;font-size:14px;">A new hackathon is now open for participation: <strong>${details.eventTitle}</strong>.</p>
    <p style="color:#434651;font-size:14px;">Scheduled start time: <strong>${startTimeText}</strong></p>
    <div style="text-align:center;margin:20px 0;">
      <a href="${innovationEventsUrl}" style="background:#002155;color:#ffffff;padding:12px 28px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px;display:inline-block;">View & Register Team</a>
    </div>`;

  await send(recipients, `Upcoming Hackathon: ${details.eventTitle}`, body, {
    mode: 'bulk',
    category: 'HACKATHON_EVENT_UPCOMING_ALL',
  });
};

// Backward-compatible alias for older imports.
export const sendInnovationEventJudgingEmail = sendInnovationEventActiveEmail;

// ─── 12. Innovation: Winners Announced ───
export const sendInnovationWinnerEmail = async (
  recipients: string[],
  details: {
    eventTitle: string;
    rank: number;
    score: number;
  }
) => {
  const body = `
    <h2 style="color:#002155;margin:0 0 8px;">Congratulations! Winner Announcement</h2>
    <p style="color:#434651;font-size:14px;">You placed <strong>#${details.rank}</strong> in <strong>${details.eventTitle}</strong>.</p>
    <p style="color:#434651;font-size:14px;">Final Score: <strong>${details.score}</strong></p>
    <div style="text-align:center;margin:20px 0;">
      <a href="${innovationEventsUrl}" style="background:#002155;color:#ffffff;padding:12px 28px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px;display:inline-block;">View Final Results</a>
    </div>
    <p style="color:#434651;font-size:14px;">Certificate and recognition details will be shared in event updates.</p>`;

  await send(recipients, `Innovation Winners: ${details.eventTitle}`, body, {
    mode: 'bulk',
    category: 'HACKATHON_WINNER',
  });
};

// ─── 12a. Innovation: Event Closed Score + Leaderboard ───
export const sendInnovationEventClosedScoreEmail = async (
  recipients: string[],
  details: {
    eventTitle: string;
    teamName: string;
    score: number | null;
    rank?: number | null;
    leaderboardUrl: string;
  }
) => {
  const scoreLine = details.score === null ? 'Score: Not Available' : `Score: ${details.score}/100`;
  const rankLine = typeof details.rank === 'number' ? `<p style="color:#434651;font-size:14px;">Leaderboard Rank: <strong>#${details.rank}</strong></p>` : '';

  const body = `
    <h2 style="color:#002155;margin:0 0 8px;">Hackathon Results Published</h2>
    <p style="color:#434651;font-size:14px;">The event <strong>${details.eventTitle}</strong> has been closed and results are now available.</p>
    <p style="color:#434651;font-size:14px;">Team: <strong>${details.teamName}</strong></p>
    <p style="color:#434651;font-size:14px;"><strong>${scoreLine}</strong></p>
    ${rankLine}
    <div style="text-align:center;margin:24px 0;">
      <a href="${details.leaderboardUrl}" style="background:#002155;color:#ffffff;padding:12px 28px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px;display:inline-block;">View Leaderboard</a>
    </div>
    <p style="color:#747782;font-size:12px;">You can view full rankings and event details on the leaderboard page.</p>`;

  await send(recipients, `Hackathon Results: ${details.eventTitle}`, body, {
    mode: 'bulk',
    category: 'HACKATHON_EVENT_CLOSED_RESULT',
  });
};

// ─── 13. Innovation: Application Selected ───
export const sendApplicationSelectionEmail = async (
  studentEmail: string,
  details: {
    studentName: string;
    problemTitle: string;
    feedback?: string | null;
  }
) => {
  const body = `
    <h2 style="color:#002155;margin:0 0 8px;">Congratulations! Application Selected</h2>
    <p style="color:#434651;font-size:14px;">Dear <strong>${details.studentName}</strong>,</p>
    <p style="color:#434651;font-size:14px;">Your application for <strong>${details.problemTitle}</strong> has been <strong>SELECTED</strong>. Well done!</p>
    ${details.feedback ? `
    <div style="background:#f5f4f0;border-left:4px solid #F7941D;padding:12px 16px;margin:16px 0;">
      <p style="margin:0;color:#434651;font-weight:bold;">Feedback from Faculty:</p>
      <p style="margin:4px 0 0;color:#002155;">${details.feedback}</p>
    </div>
    ` : ''}
    <div style="text-align:center;margin:20px 0;">
      <a href="${innovationMyApplicationsUrl}" style="background:#002155;color:#ffffff;padding:12px 28px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px;display:inline-block;">View My Application</a>
    </div>
    <p style="color:#747782;font-size:12px;">Open your application to see next steps and connect with your assigned faculty mentor.</p>`;

  await send(studentEmail, 'Application Selected — TCET CoE Innovation', body, {
    mode: 'immediate',
    category: 'APPLICATION_SELECTED',
  });
};

// ─── 14. Innovation: Application Rejected ───
export const sendApplicationRejectionEmail = async (
  studentEmail: string,
  details: {
    studentName: string;
    problemTitle: string;
    feedback?: string | null;
  }
) => {
  const body = `
    <h2 style="color:#002155;margin:0 0 8px;">Application Status Update</h2>
    <p style="color:#434651;font-size:14px;">Dear <strong>${details.studentName}</strong>,</p>
    <p style="color:#434651;font-size:14px;">After reviewing your application for <strong>${details.problemTitle}</strong>, we regret to inform you that it was not selected at this time.</p>
    ${details.feedback ? `
    <div style="background:#f5f4f0;border-left:4px solid #F7941D;padding:12px 16px;margin:16px 0;">
      <p style="margin:0;color:#434651;font-weight:bold;">Feedback from Faculty:</p>
      <p style="margin:4px 0 0;color:#002155;">${details.feedback}</p>
    </div>
    ` : ''}
    <div style="text-align:center;margin:20px 0;">
      <a href="${innovationProblemsUrl}" style="background:#002155;color:#ffffff;padding:12px 28px;text-decoration:none;font-weight:bold;font-size:13px;letter-spacing:1px;display:inline-block;">Explore Open Problems</a>
    </div>
    <p style="color:#747782;font-size:12px;">You can apply again anytime from the open problems page.</p>`;

  await send(studentEmail, 'Application Status — TCET CoE Innovation', body, {
    mode: 'immediate',
    category: 'APPLICATION_REJECTED',
  });
};

// ─── 15. Innovation: New Problem Statement Posted ───
export const sendNewProblemStatementEmail = async (
  recipients: string[],
  details: {
    problemTitle: string;
    problemDescription: string;
    tags: string | null;
    createdBy: string;
    problemId: number;
  }
) => {
  const tagsDisplay = details.tags ? `<p style="color:#747782;font-size:12px;">Tags: <strong>${details.tags}</strong></p>` : '';
  
  const body = `
    <h2 style="color:#002155;margin:0 0 8px;">New Problem Statement Available</h2>
    <p style="color:#434651;font-size:14px;">A new innovation problem statement has been posted on TCET CoE!</p>
    
    <div style="background:#f5f4f0;border-left:4px solid #F7941D;padding:16px;margin:16px 0;border-radius:4px;">
      <h3 style="margin:0 0 8px;color:#002155;font-size:15px;">${details.problemTitle}</h3>
      <p style="margin:0 0 12px;color:#434651;font-size:13px;line-height:1.5;">${details.problemDescription.substring(0, 200)}${details.problemDescription.length > 200 ? '...' : ''}</p>
      ${tagsDisplay}
      <p style="margin:8px 0 0;color:#747782;font-size:12px;">Posted by: <strong>${details.createdBy}</strong></p>
    </div>
    
    <p style="text-align:center;margin:24px 0;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/innovation/problems?problemId=${details.problemId}" style="background:#002155;color:#ffffff;padding:12px 32px;text-decoration:none;font-weight:bold;font-size:14px;letter-spacing:1px;border-radius:4px;display:inline-block;">View Problem Statement</a>
    </p>
    
    <p style="color:#747782;font-size:12px;">Have an innovative solution? Apply now on the CoE platform!</p>`;

  await send(recipients, `New Problem Statement: ${details.problemTitle}`, body, {
    mode: 'bulk',
    category: 'PROBLEM_STATEMENT_NOTIFICATION',
  });
};

// ─── 16. Ticket Issued ───
export const sendTicketIssuedEmail = async (
  email: string,
  details: {
    userName: string;
    ticketTitle: string;
    ticketId: string;
    subjectName: string;
    scheduledAt: string | null;
    ticketPdfBuffer: Buffer;
    teamMembers?: Array<{ name: string; email: string; role: string }>;
  }
) => {
  const scheduledAtText = formatEmailDateTime(details.scheduledAt);
  const teamMemberRows = (details.teamMembers || [])
    .map(
      (member) =>
        `<tr style="border-bottom:1px solid #c4c6d3;"><td style="padding:8px;color:#747782;">${member.name}</td><td style="padding:8px;color:#002155;">${member.email}</td><td style="padding:8px;color:#434651;">${member.role}</td></tr>`
    )
    .join('');

  const teamMembersSection = teamMemberRows
    ? `
    <h3 style="color:#002155;margin:16px 0 6px;font-size:15px;">Team Members</h3>
    <table style="width:100%;border-collapse:collapse;margin:0 0 16px;font-size:13px;">
      <tr style="background:#f5f4f0;border-bottom:1px solid #c4c6d3;"><th style="padding:8px;text-align:left;color:#747782;">Name</th><th style="padding:8px;text-align:left;color:#747782;">Email</th><th style="padding:8px;text-align:left;color:#747782;">Role</th></tr>
      ${teamMemberRows}
    </table>`
    : '';

  const body = `
    <h2 style="color:#002155;margin:0 0 8px;">Your Digital Ticket is Ready</h2>
    <p style="color:#434651;font-size:14px;">Dear <strong>${details.userName}</strong>,</p>
    <p style="color:#434651;font-size:14px;">Your <strong>${details.ticketTitle}</strong> has been generated.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
      <tr style="border-bottom:1px solid #c4c6d3;"><td style="padding:8px;color:#747782;font-weight:bold;">Ticket ID</td><td style="padding:8px;color:#002155;">${details.ticketId}</td></tr>
      <tr style="border-bottom:1px solid #c4c6d3;background:#f5f4f0;"><td style="padding:8px;color:#747782;font-weight:bold;">Type</td><td style="padding:8px;color:#002155;">${details.ticketTitle}</td></tr>
      <tr style="border-bottom:1px solid #c4c6d3;"><td style="padding:8px;color:#747782;font-weight:bold;">Event / Booking</td><td style="padding:8px;color:#002155;">${details.subjectName}</td></tr>
      <tr style="background:#f5f4f0;"><td style="padding:8px;color:#747782;font-weight:bold;">Date & Time</td><td style="padding:8px;color:#002155;">${scheduledAtText}</td></tr>
    </table>
    ${teamMembersSection}
    <p style="color:#747782;font-size:12px;">Your ticket PDF is attached to this email. Present it at entry. Each ticket is valid for one successful verification only.</p>`;

  const subject = `${details.ticketTitle} Issued — ${details.ticketId}`;
  const wrappedHtml = wrap(body);

  try {
    const result = await sendEmail({
      to: email,
      subject,
      html: wrappedHtml,
      attachments: [
        {
          filename: `${details.ticketId}.pdf`,
          content: details.ticketPdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    await (prisma as any).emailJob.create({
      data: {
        toEmail: email.trim().toLowerCase(),
        subject,
        htmlBody: wrappedHtml,
        category: 'TICKET_ISSUED',
        mode: 'IMMEDIATE',
        status: 'SENT',
        priority: Number.parseInt(process.env.EMAIL_PRIORITY_IMMEDIATE || '100', 10),
        attempts: 1,
        maxAttempts: 1,
        lastAttemptAt: new Date(),
        sentAt: new Date(),
        providerMessageId: (result as any)?.messageId || null,
        metadata: {
          source: 'mailer.sendTicketIssuedEmail',
          ticketId: details.ticketId,
          hasAttachment: true,
        },
      },
    });
  } catch (err) {
    await (prisma as any).emailJob.create({
      data: {
        toEmail: email.trim().toLowerCase(),
        subject,
        htmlBody: wrappedHtml,
        category: 'TICKET_ISSUED',
        mode: 'IMMEDIATE',
        status: 'FAILED',
        priority: Number.parseInt(process.env.EMAIL_PRIORITY_IMMEDIATE || '100', 10),
        attempts: 1,
        maxAttempts: 1,
        lastAttemptAt: new Date(),
        lastError: err instanceof Error ? err.message.slice(0, 1900) : String(err).slice(0, 1900),
        metadata: {
          source: 'mailer.sendTicketIssuedEmail',
          ticketId: details.ticketId,
          hasAttachment: true,
        },
      },
    });

    throw err;
  }
};
