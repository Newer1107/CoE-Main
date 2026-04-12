import { z } from 'zod';

export const committeeCreateEventSchema = z.object({
  title: z.string().trim().min(1, 'title is required'),
  tracks: z.array(z.string().trim().min(1, 'track name is required')).min(1, 'at least one track is required'),
});

export const committeeTrackRoomUpdateSchema = z.object({
  room: z.string().trim().optional().nullable(),
});

export const committeeCreateEvaluatorSchema = z.object({
  email: z.string().trim().email('invalid email'),
  name: z.string().trim().min(1, 'name is required'),
  password: z.string().min(6, 'password must be at least 6 characters'),
});

export const committeeRubricItemSchema = z.object({
  label: z.string().trim().min(1, 'label is required'),
  maxScore: z.number().int().positive('maxScore must be > 0'),
  weight: z.number().positive('weight must be > 0'),
  order: z.number().int().nonnegative('order must be >= 0'),
});

export const committeeCreateRubricSchema = z.object({
  eventId: z.number().int().positive('eventId must be > 0'),
  items: z.array(committeeRubricItemSchema).min(1, 'at least one rubric item is required'),
});

export const committeeRegisterSchema = z.object({
  trackId: z.number().int().positive('trackId must be > 0'),
});

export const committeeEvaluatorScoreSchema = z.object({
  registrationId: z.number().int().positive('registrationId must be > 0'),
  scores: z
    .array(
      z.object({
        rubricItemId: z.number().int().positive('rubricItemId must be > 0'),
        score: z.number().int().nonnegative('score must be >= 0'),
        feedback: z.string().trim().optional().nullable(),
      })
    )
    .min(1, 'at least one score is required'),
});
