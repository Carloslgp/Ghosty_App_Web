import { z } from 'zod';
import { isValidTimezone } from '../../domain/message/message-composer.js';

const timezone = z.string().max(64).refine(isValidTimezone, 'fuso horário desconhecido');
const template = z.string().min(1).max(4096);

export const readinessRequestSchema = z.object({
  notes: z.object({ updatedLast14Days: z.number().int().min(0) }).nullable(),
  safety: z.object({
    displayName: z.string().min(1).max(80),
    totalContacts: z.number().int().min(0),
    confirmedContacts: z.number().int().min(0),
    firstConfirmedNickname: z.string().max(40).nullable(),
    messageTemplate: template,
    messageReviewed: z.boolean(),
    includeLocation: z.boolean(),
    secretCodeSet: z.boolean(),
    lastTestAt: z.iso.datetime({ offset: true }).nullable(),
  }),
  geoPermission: z.enum(['granted', 'denied', 'prompt', 'unknown']),
  now: z.iso.datetime({ offset: true }).optional(),
  timezone: timezone.optional(),
});

export const messagePreviewRequestSchema = z.object({
  template,
  displayName: z.string().min(1).max(80),
  contactNickname: z.string().min(1).max(40),
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      accuracyMeters: z.number().min(0).nullable().optional(),
    })
    .optional(),
  at: z.iso.datetime({ offset: true }).optional(),
  timezone: timezone.optional(),
});
