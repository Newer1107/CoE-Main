import { z } from 'zod';

const tcetUidSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^\d{2}-[A-Z]+[A-Z]\d{2,3}-\d{2}$/, 'Invalid UID format. Expected e.g. 24-COMPD13-28');

// ─── Auth Validators ───

export const studentRegisterSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email().refine((e) => e.endsWith('@tcetmumbai.in'), { message: 'Email must be a @tcetmumbai.in address' }),
  phone: z.string().min(10, 'Phone must be at least 10 digits'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  uid: tcetUidSchema,
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

export const heroSlideCreateSchema = z.object({
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

// ─── Innovation Validators ───

export const innovationProblemCreateSchema = z.object({
  title: z.string().min(2),
  description: z.string().min(5),
  tags: z.string().optional().or(z.literal('')),
  mode: z.enum(['OPEN', 'CLOSED']),
  eventId: z.coerce.number().int().positive().optional(),
});

export const innovationProblemUpdateSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().min(5).optional(),
  tags: z.string().optional().or(z.literal('')),
  mode: z.enum(['OPEN', 'CLOSED']).optional(),
  status: z.enum(['UNCLAIMED', 'CLAIMED', 'SOLVED', 'ARCHIVED']).optional(),
});

export const innovationClaimCreateSchema = z.object({
  problemId: z.coerce.number().int().positive(),
  teamName: z.string().min(2).optional().or(z.literal('')),
  memberUids: z.array(tcetUidSchema).optional(),
});

export const innovationClaimSubmitSchema = z.object({
  submissionUrl: z.string().url().optional().or(z.literal('')),
});

export const innovationClaimReviewSchema = z.object({
  status: z.enum(['ACCEPTED', 'REVISION_REQUESTED', 'REJECTED']),
  score: z.coerce.number().int().min(0).max(100).optional(),
  feedback: z.string().min(2).optional().or(z.literal('')),
  badges: z.string().optional().or(z.literal('')),
});

export const innovationHackathonRubricSchema = z.object({
  innovation: z.coerce.number().int().min(0).max(10),
  technical: z.coerce.number().int().min(0).max(10),
  impact: z.coerce.number().int().min(0).max(10),
  ux: z.coerce.number().int().min(0).max(10),
  execution: z.coerce.number().int().min(0).max(10),
  presentation: z.coerce.number().int().min(0).max(10),
  feasibility: z.coerce.number().int().min(0).max(10),
});

export const innovationEventCreateSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional().or(z.literal('')),
  startTime: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid startTime'),
  endTime: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid endTime'),
  problems: z
    .array(
      z.object({
        title: z.string().min(2),
        description: z.string().min(5),
      })
    )
    .min(1, 'At least one hackathon problem statement is required'),
});

export const innovationEventUpdateSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().optional().or(z.literal('')),
  startTime: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid startTime').optional(),
  endTime: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid endTime').optional(),
  registrationOpen: z.boolean().optional(),
  status: z.enum(['UPCOMING', 'ACTIVE', 'JUDGING', 'CLOSED']).optional(),
});

export const innovationEventRegisterSchema = z.object({
  teamName: z.string().min(2),
  teamSize: z.coerce.number().int().min(1).max(10),
  teamLeadUid: tcetUidSchema,
  memberUids: z.array(tcetUidSchema),
  problemId: z.coerce.number().int().positive(),
});

export const innovationEventStatusSchema = z.object({
  status: z.enum(['UPCOMING', 'ACTIVE', 'JUDGING', 'CLOSED']),
});

export const innovationBulkClaimDecisionSchema = z.object({
  stage: z.enum(['SCREENING', 'JUDGING']),
  eventId: z.coerce.number().int().positive().optional(),
  decisions: z
    .array(
      z.object({
        claimId: z.coerce.number().int().positive(),
        status: z.enum(['SHORTLISTED', 'ACCEPTED', 'REJECTED']),
        rubrics: innovationHackathonRubricSchema.optional(),
      })
    )
    .min(1, 'At least one decision is required'),
}).superRefine((value, ctx) => {
  value.decisions.forEach((decision, index) => {
    if (value.stage === 'SCREENING') {
      if (!['SHORTLISTED', 'REJECTED'].includes(decision.status)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['decisions', index, 'status'],
          message: 'Screening decisions must be SHORTLISTED or REJECTED',
        });
      }
      return;
    }

    if (!['ACCEPTED', 'REJECTED'].includes(decision.status)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['decisions', index, 'status'],
        message: 'Judging decisions must be ACCEPTED or REJECTED',
      });
    }

    if (!decision.rubrics) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['decisions', index, 'rubrics'],
        message: 'Rubric scores are required during judging sync',
      });
    }
  });
});
