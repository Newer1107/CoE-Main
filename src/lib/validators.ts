import { z } from 'zod';

// ─── Auth Validators ───

export const studentRegisterSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email().refine((e) => e.endsWith('@tcetmumbai.in'), { message: 'Email must be a @tcetmumbai.in address' }),
  phone: z.string().min(10, 'Phone must be at least 10 digits'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  uid: z.string().regex(/^\d{2}-[A-Z]+[A-Z]\d{2,3}-\d{2}$/, 'Invalid UID format. Expected e.g. 24-COMPD13-28'),
});

export const facultyRegisterSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().refine((e) => e.endsWith('@tcetmumbai.in'), { message: 'Email must be a @tcetmumbai.in address' }),
  phone: z.string().min(10),
  password: z.string().min(6),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const otpVerifySchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
});

export const resendOtpSchema = z.object({
  email: z.string().email(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

// ─── Booking Validators ───

export const bookingCreateSchema = z.object({
  purpose: z.string().min(5),
  date: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid date'),
  timeSlot: z.string().min(1),
  facilities: z.array(z.string()).min(0),
  lab: z.string().min(1),
});

// ─── News Validators ───

export const newsCreateSchema = z.object({
  title: z.string().min(2),
  caption: z.string().min(2),
});

export const newsUpdateSchema = z.object({
  title: z.string().min(2).optional(),
  caption: z.string().min(2).optional(),
});

// ─── Grant Validators ───

export const grantCreateSchema = z.object({
  title: z.string().min(2),
  issuingBody: z.string().min(2),
  category: z.enum(['GOVT_GRANT', 'SCHOLARSHIP', 'RESEARCH_FUND', 'INDUSTRY_GRANT']),
  description: z.string().min(5),
  deadline: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid date'),
  referenceLink: z.string().url().optional().or(z.literal('')),
});

export const grantUpdateSchema = z.object({
  title: z.string().min(2).optional(),
  issuingBody: z.string().min(2).optional(),
  category: z.enum(['GOVT_GRANT', 'SCHOLARSHIP', 'RESEARCH_FUND', 'INDUSTRY_GRANT']).optional(),
  description: z.string().min(5).optional(),
  deadline: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid date').optional(),
  referenceLink: z.string().url().optional().or(z.literal('')),
});

// ─── Event Validators ───

export const eventCreateSchema = z.object({
  title: z.string().min(2),
  description: z.string().min(5),
  date: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid date'),
  mode: z.enum(['ONLINE', 'OFFLINE', 'HYBRID']),
  registrationLink: z.string().url().optional().or(z.literal('')),
});

export const eventUpdateSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().min(5).optional(),
  date: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid date').optional(),
  mode: z.enum(['ONLINE', 'OFFLINE', 'HYBRID']).optional(),
  registrationLink: z.string().url().optional().or(z.literal('')),
});

// ─── Announcement Validators ───

export const announcementCreateSchema = z.object({
  text: z.string().min(2),
  link: z.string().url().optional().or(z.literal('')),
  expiresAt: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid date'),
});
