import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const brandHeader = `
  <div style="background:#002155;padding:16px 24px;text-align:center;">
    <h1 style="margin:0;color:#ffffff;font-family:'Helvetica Neue',Arial,sans-serif;font-size:20px;letter-spacing:2px;">TCET CENTER OF EXCELLENCE</h1>
    <div style="height:4px;background:#F7941D;margin-top:8px;"></div>
  </div>
`;

const brandFooter = `
  <div style="background:#f5f4f0;padding:16px 24px;text-align:center;font-size:11px;color:#747782;font-family:Arial,sans-serif;">
    <p style="margin:0;">Thakur College of Engineering &amp; Technology, Kandivali (E), Mumbai - 400101</p>
    <p style="margin:4px 0 0;">&copy; 2024 TCET Center of Excellence. All Rights Reserved.</p>
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

const send = async (to: string | string[], subject: string, htmlBody: string) => {
  await transporter.sendMail({
    from: process.env.SMTP_FROM || '"TCET CoE" <noreply@tcetmumbai.in>',
    to,
    subject,
    html: wrap(htmlBody),
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
  await send(email, `Verify your TCET CoE account — OTP: ${otp}`, body);
};

export const sendPasswordResetOTPEmail = async (email: string, otp: string) => {
  const body = `
    <h2 style="color:#002155;margin:0 0 8px;">Reset Your CoE Account Password</h2>
    <p style="color:#434651;font-size:14px;">Use the following One-Time Password to reset your account password:</p>
    <div style="background:#f5f4f0;border-left:4px solid #F7941D;padding:16px 24px;margin:16px 0;text-align:center;">
      <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#002155;">${otp}</span>
    </div>
    <p style="color:#747782;font-size:12px;">This code is valid for <strong>10 minutes</strong>. If you did not request this reset, you can ignore this email.</p>`;
  await send(email, `Reset your TCET CoE password — OTP: ${otp}`, body);
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
    <h2 style="color:#002155;margin:0 0 8px;">Your CoE Facility Booking is Confirmed ✅</h2>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
      <tr style="border-bottom:1px solid #c4c6d3;"><td style="padding:8px;color:#747782;font-weight:bold;">Booking ID</td><td style="padding:8px;color:#002155;">${b.id}</td></tr>
      <tr style="border-bottom:1px solid #c4c6d3;background:#f5f4f0;"><td style="padding:8px;color:#747782;font-weight:bold;">Name</td><td style="padding:8px;color:#002155;">${b.studentName}</td></tr>
      <tr style="border-bottom:1px solid #c4c6d3;"><td style="padding:8px;color:#747782;font-weight:bold;">Date</td><td style="padding:8px;color:#002155;">${b.date}</td></tr>
      <tr style="border-bottom:1px solid #c4c6d3;background:#f5f4f0;"><td style="padding:8px;color:#747782;font-weight:bold;">Time Slot</td><td style="padding:8px;color:#002155;">${b.timeSlot}</td></tr>
      <tr style="border-bottom:1px solid #c4c6d3;"><td style="padding:8px;color:#747782;font-weight:bold;">Lab</td><td style="padding:8px;color:#002155;">${b.lab}</td></tr>
      <tr style="background:#f5f4f0;"><td style="padding:8px;color:#747782;font-weight:bold;">Facilities</td><td style="padding:8px;color:#002155;">${facilities}</td></tr>
    </table>`;
  await send(email, 'Your CoE Facility Booking is Confirmed ✅', body);
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
  await send(email, 'Facility Booking Rejected — TCET CoE', body);
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
  await send(email, '⏰ Reminder: Your CoE lab booking starts in 30 minutes', body);
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
  await send(adminEmail, 'New Faculty Account Pending Approval — TCET CoE', body);
};

// ─── 6. Faculty Approved ───
export const sendFacultyApprovalEmail = async (email: string, name: string) => {
  const body = `
    <h2 style="color:#002155;margin:0 0 8px;">Account Approved ✅</h2>
    <p style="color:#434651;font-size:14px;">Dear <strong>${name}</strong>,</p>
    <p style="color:#434651;font-size:14px;">Your CoE faculty account has been approved. You may now log in and access all faculty features.</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/facility-booking" style="background:#002155;color:#ffffff;padding:12px 32px;text-decoration:none;font-weight:bold;font-size:14px;letter-spacing:1px;">LOG IN NOW</a>
    </div>`;
  await send(email, 'Your CoE Faculty Account is Approved ✅', body);
};

// ─── 7. Faculty Rejected ───
export const sendFacultyRejectionEmail = async (email: string, name: string) => {
  const body = `
    <h2 style="color:#002155;margin:0 0 8px;">Account Registration Rejected</h2>
    <p style="color:#434651;font-size:14px;">Dear <strong>${name}</strong>,</p>
    <p style="color:#434651;font-size:14px;">Your faculty account registration for the TCET Center of Excellence has been rejected. Please contact the CoE office if you believe this is an error.</p>`;
  await send(email, 'Faculty Account Registration Rejected — TCET CoE', body);
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
    <p style="color:#747782;font-size:12px;">Please review submissions in the Innovation dashboard.</p>`;

  await send(facultyEmail, 'Innovation Update: Problem Claimed', body);
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
    </div>`;

  await send(recipients, 'Innovation Submission Review Update', body);
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
    <p style="color:#434651;font-size:14px;">Result: <strong>${statusLine}</strong></p>`;

  await send(recipients, 'Hackathon PPT Screening Result', body);
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
      <tr style="border-bottom:1px solid #c4c6d3;"><td style="padding:8px;color:#747782;font-weight:bold;">Innovation</td><td style="padding:8px;color:#002155;">${details.rubrics.innovation}/10</td></tr>
      <tr style="border-bottom:1px solid #c4c6d3;background:#f5f4f0;"><td style="padding:8px;color:#747782;font-weight:bold;">Technical</td><td style="padding:8px;color:#002155;">${details.rubrics.technical}/10</td></tr>
      <tr style="border-bottom:1px solid #c4c6d3;"><td style="padding:8px;color:#747782;font-weight:bold;">Impact</td><td style="padding:8px;color:#002155;">${details.rubrics.impact}/10</td></tr>
      <tr style="border-bottom:1px solid #c4c6d3;background:#f5f4f0;"><td style="padding:8px;color:#747782;font-weight:bold;">UX</td><td style="padding:8px;color:#002155;">${details.rubrics.ux}/10</td></tr>
      <tr style="border-bottom:1px solid #c4c6d3;"><td style="padding:8px;color:#747782;font-weight:bold;">Execution</td><td style="padding:8px;color:#002155;">${details.rubrics.execution}/10</td></tr>
      <tr style="border-bottom:1px solid #c4c6d3;background:#f5f4f0;"><td style="padding:8px;color:#747782;font-weight:bold;">Presentation</td><td style="padding:8px;color:#002155;">${details.rubrics.presentation}/10</td></tr>
      <tr style="border-bottom:1px solid #c4c6d3;"><td style="padding:8px;color:#747782;font-weight:bold;">Feasibility</td><td style="padding:8px;color:#002155;">${details.rubrics.feasibility}/10</td></tr>
      <tr style="background:#f5f4f0;"><td style="padding:8px;color:#747782;font-weight:bold;">Final Score</td><td style="padding:8px;color:#002155;"><strong>${details.finalScore}/100</strong></td></tr>
    </table>`;

  await send(recipients, 'Hackathon Evaluation Result', body);
};

// ─── 10. Innovation: Event Ending Reminder ───
export const sendInnovationEventReminderEmail = async (
  recipients: string[],
  details: {
    eventTitle: string;
    endTime: string;
  }
) => {
  const body = `
    <h2 style="color:#002155;margin:0 0 8px;">Hackathon Reminder: 30 Minutes Left</h2>
    <p style="color:#434651;font-size:14px;">Your event <strong>${details.eventTitle}</strong> is closing soon.</p>
    <p style="color:#434651;font-size:14px;">Submission lock time: <strong>${details.endTime}</strong></p>`;

  await send(recipients, 'Innovation Reminder: 30 Minutes Remaining', body);
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
    <p style="color:#434651;font-size:14px;">Final judging is now open during the active phase. Results are announced when the event is closed.</p>`;

  await send(recipients, 'Innovation Update: Event Is Active', body);
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
    <p style="color:#434651;font-size:14px;">Please watch the admin announcements for certificate and recognition details.</p>`;

  await send(recipients, `Innovation Winners: ${details.eventTitle}`, body);
};
