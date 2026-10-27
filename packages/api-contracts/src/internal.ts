import { z } from "zod";

import {
  airportCodeSchema,
  appRoleSchema,
  flightNumberSchema,
  flightStatusSchema,
  idSchema,
  isoDateTimeSchema,
  reservationCodeSchema,
  reservationStatusSchema,
} from "./common.js";
import { airportSchema, passengerInputSchema } from "./public.js";

export const sessionUserSchema = z.object({
  username: z.string().min(1).max(80),
  displayName: z.string().min(1).max(120),
  roles: z.array(appRoleSchema).min(1),
});

export const loginRequestSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(256),
});

export const sessionResponseSchema = z.object({
  authenticated: z.boolean(),
  user: sessionUserSchema.nullable(),
  csrfToken: z.string().min(1).nullable(),
  expiresAt: isoDateTimeSchema.nullable(),
});

const flightFields = {
  flightNumber: flightNumberSchema,
  origin: airportCodeSchema,
  destination: airportCodeSchema,
  durationMinutes: z.number().int().min(20).max(1440),
  active: z.boolean().default(true),
};

export const createFlightRequestSchema = z
  .object(flightFields)
  .refine((value) => value.origin !== value.destination, {
    message: "El origen y el destino deben ser diferentes",
    path: ["destination"],
  });

export const updateFlightRequestSchema = z
  .object({
    flightNumber: flightFields.flightNumber.optional(),
    origin: flightFields.origin.optional(),
    destination: flightFields.destination.optional(),
    durationMinutes: flightFields.durationMinutes.optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.origin === undefined ||
      value.destination === undefined ||
      value.origin !== value.destination,
    {
      message: "El origen y el destino deben ser diferentes",
      path: ["destination"],
    },
  );

export const createFlightInstanceRequestSchema = z
  .object({
    flightId: idSchema,
    aircraftId: idSchema,
    departureAt: isoDateTimeSchema,
    arrivalAt: isoDateTimeSchema,
    capacity: z.number().int().positive().max(600),
  })
  .refine(
    (value) =>
      new Date(value.arrivalAt).getTime() >
      new Date(value.departureAt).getTime(),
    {
      message: "La llegada debe ser posterior a la salida",
      path: ["arrivalAt"],
    },
  );

export const updateFlightStatusRequestSchema = z.object({
  status: flightStatusSchema,
});

export const internalReservationSchema = z.object({
  id: idSchema,
  code: reservationCodeSchema,
  status: reservationStatusSchema,
  contactEmail: z.email(),
  flightInstanceId: idSchema,
  passengers: z.array(
    passengerInputSchema.extend({
      id: idSchema,
      seatNumber: z.string().nullable(),
      checkedInAt: isoDateTimeSchema.nullable(),
    }),
  ),
  createdAt: isoDateTimeSchema,
});

export const checkInRequestSchema = z.object({
  passengerIds: z.array(idSchema).min(1).optional(),
});

export const checkInResponseSchema = z.object({
  reservationCode: reservationCodeSchema,
  status: z.literal("CHECKED_IN"),
  seats: z.array(
    z.object({
      passengerId: idSchema,
      seatNumber: z.string().min(2).max(4),
    }),
  ),
});

export const auditEventSchema = z.object({
  id: idSchema,
  actor: z.string().min(1),
  action: z.string().min(1),
  entityType: z.string().min(1),
  entityId: idSchema,
  details: z.unknown(),
  createdAt: isoDateTimeSchema,
});

export const dashboardResponseSchema = z.object({
  scheduledFlights: z.number().int().min(0),
  boardingFlights: z.number().int().min(0),
  confirmedReservations: z.number().int().min(0),
  checkedInPassengers: z.number().int().min(0),
});

export type SessionUser = z.infer<typeof sessionUserSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type CreateFlightRequest = z.infer<typeof createFlightRequestSchema>;
export type UpdateFlightRequest = z.infer<typeof updateFlightRequestSchema>;
export type CreateFlightInstanceRequest = z.infer<
  typeof createFlightInstanceRequestSchema
>;
export type UpdateFlightStatusRequest = z.infer<
  typeof updateFlightStatusRequestSchema
>;
export type InternalReservation = z.infer<typeof internalReservationSchema>;
export type CheckInRequest = z.infer<typeof checkInRequestSchema>;
export type CheckInResponse = z.infer<typeof checkInResponseSchema>;
export type AuditEventResponse = z.infer<typeof auditEventSchema>;
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;

// Respuestas JSON para la intranet. Las listas se devuelven como arrays sin envoltorio.
export const internalAirportSchema = airportSchema.extend({
  id: idSchema,
  active: z.boolean(),
});

export const internalAircraftSchema = z.object({
  id: idSchema,
  registration: z.string().min(1).max(32),
  model: z.string().min(1).max(120),
  capacity: z.number().int().positive().max(600),
  active: z.boolean(),
});

export const internalFlightSchema = z
  .object({
    id: idSchema,
    flightNumber: flightNumberSchema,
    origin: airportCodeSchema,
    destination: airportCodeSchema,
    durationMinutes: z.number().int().min(20).max(1440),
    active: z.boolean(),
  })
  .refine((value) => value.origin !== value.destination, {
    message: "El origen y el destino deben ser diferentes",
  });

export const internalFlightInstanceSchema = z
  .object({
    id: idSchema,
    flightId: idSchema,
    aircraftId: idSchema,
    flightNumber: flightNumberSchema,
    origin: airportCodeSchema,
    destination: airportCodeSchema,
    departureAt: isoDateTimeSchema,
    arrivalAt: isoDateTimeSchema,
    status: flightStatusSchema,
    capacity: z.number().int().positive().max(600),
    reservedSeats: z.number().int().min(0),
    availableSeats: z.number().int().min(0),
  })
  .refine(
    (value) => value.reservedSeats + value.availableSeats === value.capacity,
    {
      message: "El inventario de asientos no coincide con la capacidad",
    },
  )
  .refine((value) => new Date(value.arrivalAt) > new Date(value.departureAt), {
    message: "La llegada debe ser posterior a la salida",
  });

// Búsqueda de reservas por código, nombre, apellido o documento; siempre con sesión.
export const internalReservationSearchSchema = z.object({
  q: z.string().trim().min(2).max(120),
});

export type InternalAirport = z.infer<typeof internalAirportSchema>;
export type InternalAircraft = z.infer<typeof internalAircraftSchema>;
export type InternalFlight = z.infer<typeof internalFlightSchema>;
export type InternalFlightInstance = z.infer<
  typeof internalFlightInstanceSchema
>;
export type InternalReservationSearch = z.infer<
  typeof internalReservationSearchSchema
>;
