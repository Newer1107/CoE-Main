import { z } from 'zod';
import { HACKATHON_RUBRIC_WEIGHTS } from './hackathon-scoring';

const tcetUidSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^\d{2}-[A-Z]+[A-Z]\d{2,3}-\d{2}$/, 'Invalid UID format. Expected e.g. 24-COMPD13-28');

const booleanLikeSchema = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
  }
  return value;
}, z.boolean());

const industryNameSchema = z
  .string()
  .trim()
  .min(2, 'Industry name must be at least 2 characters')
  .max(120, 'Industry name must be at most 120 characters');

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

export const industryPartnerCreateSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  name: z.string().trim().min(2, 'Name must be at least 2 characters').optional(),
  phone: z.string().trim().min(10, 'Phone must be at least 10 digits').optional().or(z.literal('')),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
  industryId: z.coerce.number().int().positive('industryId must be a positive integer').optional(),
  industryName: z.string().trim().min(2, 'Industry name must be at least 2 characters').max(120).optional().or(z.literal('')),
}).superRefine((value, ctx) => {
  const hasIndustryId = typeof value.industryId === 'number';
  const hasIndustryName = typeof value.industryName === 'string' && value.industryName.trim().length > 0;

  if (!hasIndustryId && !hasIndustryName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['industryName'],
      message: 'Either industryId or industryName is required',
    });
  }
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(2, 'Email or UID is required'),
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
  problemType: z.enum(['OPEN', 'INTERNSHIP']).optional().default('OPEN'),
  approvalStatus: z.enum(['PENDING_APPROVAL', 'APPROVED', 'REJECTED']).optional(),
  eventId: z.coerce.number().int().positive().optional(),
  isIndustryProblem: booleanLikeSchema.optional().default(false),
  industryName: industryNameSchema.optional().or(z.literal('')),
}).superRefine((value, ctx) => {
  const normalizedIndustryName = typeof value.industryName === 'string' ? value.industryName.trim() : '';
  if (value.isIndustryProblem && normalizedIndustryName.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['industryName'],
      message: 'Industry name is required for industry problems',
    });
  }

  if (!value.isIndustryProblem && normalizedIndustryName.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['industryName'],
      message: 'Industry name is only allowed when the problem type is industry',
    });
  }

  if (value.problemType === 'INTERNSHIP' && value.mode !== 'OPEN') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['mode'],
      message: 'Internship problems must use OPEN mode.',
    });
  }

  if (value.problemType === 'INTERNSHIP' && !value.isIndustryProblem) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['isIndustryProblem'],
      message: 'Internship problems must be marked as industry problems.',
    });
  }
});

export const innovationProblemUpdateSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().min(5).optional(),
  tags: z.string().optional().or(z.literal('')),
  mode: z.enum(['OPEN', 'CLOSED']).optional(),
  status: z.enum(['OPENED', 'CLOSED', 'ARCHIVED']).optional(),
  problemType: z.enum(['OPEN', 'INTERNSHIP']).optional(),
  approvalStatus: z.enum(['PENDING_APPROVAL', 'APPROVED', 'REJECTED']).optional(),
  isIndustryProblem: booleanLikeSchema.optional(),
  industryName: industryNameSchema.optional().or(z.literal('')),
}).superRefine((value, ctx) => {
  const hasIndustryName = typeof value.industryName === 'string' && value.industryName.trim().length > 0;
  if (value.isIndustryProblem === false && hasIndustryName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['industryName'],
      message: 'Industry name is only allowed when the problem type is industry',
    });
  }

  if (value.problemType === 'INTERNSHIP' && value.mode === 'CLOSED') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['mode'],
      message: 'Internship problems must remain in OPEN mode.',
    });
  }
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

export const innovationOpenSubmissionRegisterSchema = z.object({
  problemId: z.coerce.number().int().positive(),
  teamName: z.string().min(2),
  teamSize: z.coerce.number().int().min(1).max(10),
  teamLeadUid: tcetUidSchema,
  memberUids: z.array(tcetUidSchema),
});

const innovationRubricSchema = z.object({
  innovation: z.coerce.number().int().min(0).max(HACKATHON_RUBRIC_WEIGHTS.innovation),
  technical: z.coerce.number().int().min(0).max(HACKATHON_RUBRIC_WEIGHTS.technical),
  impact: z.coerce.number().int().min(0).max(HACKATHON_RUBRIC_WEIGHTS.impact),
  ux: z.coerce.number().int().min(0).max(HACKATHON_RUBRIC_WEIGHTS.ux),
  execution: z.coerce.number().int().min(0).max(HACKATHON_RUBRIC_WEIGHTS.execution),
  presentation: z.coerce.number().int().min(0).max(HACKATHON_RUBRIC_WEIGHTS.presentation),
  feasibility: z.coerce.number().int().min(0).max(HACKATHON_RUBRIC_WEIGHTS.feasibility),
});

export const innovationOpenSubmissionReviewSchema = z.object({
  status: z.enum(['ACCEPTED', 'REVISION_REQUESTED', 'REJECTED']),
  rubrics: innovationRubricSchema.optional(),
  feedback: z.string().min(2).optional().or(z.literal('')),
  badges: z.string().optional().or(z.literal('')),
}).superRefine((value, ctx) => {
  if ((value.status === 'ACCEPTED' || value.status === 'REJECTED') && !value.rubrics) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rubrics'],
      message: 'Rubric scores are required when saving final open statement decisions',
    });
  }
});

export const innovationClaimAttendanceSchema = z.object({
  isAbsent: z.boolean(),
});

export const innovationHackathonRubricSchema = innovationRubricSchema;

export const innovationEventCreateSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional().or(z.literal('')),
  startTime: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid startTime'),
  endTime: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid endTime'),
  submissionLockAt: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid submissionLockAt'),
  totalSessions: z.coerce.number().int().min(1).max(30).default(1),
  problems: z
    .array(
      z.object({
        title: z.string().min(2),
        description: z.string().min(5),
        isIndustryProblem: booleanLikeSchema.optional().default(false),
        industryName: industryNameSchema.optional().or(z.literal('')),
      }).superRefine((value, ctx) => {
        const normalizedIndustryName = typeof value.industryName === 'string' ? value.industryName.trim() : '';
        if (value.isIndustryProblem && normalizedIndustryName.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['industryName'],
            message: 'Industry name is required for industry problems',
          });
        }

        if (!value.isIndustryProblem && normalizedIndustryName.length > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['industryName'],
            message: 'Industry name is only allowed when the problem type is industry',
          });
        }
      })
    )
    .min(1, 'At least one hackathon problem statement is required'),
});

export const innovationEventUpdateSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().optional().or(z.literal('')),
  startTime: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid startTime').optional(),
  endTime: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid endTime').optional(),
  submissionLockAt: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid submissionLockAt').optional(),
  totalSessions: z.coerce.number().int().min(1).max(30).optional(),
  registrationOpen: z.boolean().optional(),
  status: z.enum(['UPCOMING', 'ACTIVE', 'JUDGING', 'CLOSED']).optional(),
});

export const innovationEventRegisterSchema = z.object({
  teamName: z.string().min(2),
  teamSize: z.coerce.number().int().min(1).max(5),
  teamLeadUid: tcetUidSchema,
  memberUids: z.array(tcetUidSchema),
  problemId: z.coerce.number().int().positive(),
});

export const innovationInterestCreateSchema = z.object({
  eventId: z.coerce.number().int().positive(),
});

export const innovationInterestUpdateSchema = z.object({
  eventId: z.coerce.number().int().positive(),
  teamName: z.string().trim().max(120, 'Team name must be at most 120 characters').optional().or(z.literal('')),
  teamSize: z.coerce.number().int().min(1).max(5),
});

export const innovationEventStatusSchema = z.object({
  status: z.enum(['UPCOMING', 'ACTIVE', 'JUDGING', 'CLOSED']),
});

export const innovationProgramCreateSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters'),
  description: z.string().trim().min(5, 'Description must be at least 5 characters'),
  programType: z.string().trim().min(2, 'Program type is required'),
  venue: z.string().trim().min(2, 'Venue is required'),
  eventDate: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid eventDate'),
  startTime: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid startTime'),
  endTime: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid endTime'),
});

export const innovationProgramUpdateSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters').optional(),
  description: z.string().trim().min(5, 'Description must be at least 5 characters').optional(),
  programType: z.string().trim().min(2, 'Program type is required').optional(),
  venue: z.string().trim().min(2, 'Venue is required').optional(),
  eventDate: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid eventDate').optional(),
  startTime: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid startTime').optional(),
  endTime: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid endTime').optional(),
  removeNoticeFile: z.boolean().optional(),
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
