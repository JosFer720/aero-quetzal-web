import { APP_ROLES, FLIGHT_STATUSES, RESERVATION_STATUSES } from "@aeroquetzal/domain";
import { z } from "zod";

export const idSchema = z.string().min(1).max(64);
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const airportCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);
export const flightNumberSchema = z.string().trim().toUpperCase().regex(/^AQ\d{3,4}$/);
export const documentNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{5,24}$/);
export const reservationCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^AQ[A-Z0-9]{5}$/);
export const reservationStatusSchema = z.enum(RESERVATION_STATUSES);
export const flightStatusSchema = z.enum(FLIGHT_STATUSES);
export const appRoleSchema = z.enum(APP_ROLES);

export const errorResponseSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
