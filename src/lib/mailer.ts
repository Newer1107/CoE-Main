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

const send = async (to: string, subject: string, htmlBody: string) => {
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
