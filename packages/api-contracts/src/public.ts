import { z } from "zod";

import {
  airportCodeSchema,
  documentNumberSchema,
  flightNumberSchema,
  flightStatusSchema,
  idSchema,
  isoDateTimeSchema,
  reservationCodeSchema,
  reservationStatusSchema,
} from "./common.js";

export const airportSchema = z.object({
  code: airportCodeSchema,
  name: z.string().min(1).max(120),
  city: z.string().min(1).max(80),
  country: z.string().min(1).max(80),
});

export const flightSearchQuerySchema = z
  .object({
    origin: airportCodeSchema,
    destination: airportCodeSchema,
    date: z.iso.date(),
  })
  .refine((value) => value.origin !== value.destination, {
    message: "El origen y el destino deben ser diferentes",
    path: ["destination"],
  });

export const publicFlightSchema = z.object({
  id: idSchema,
  flightNumber: flightNumberSchema,
  origin: airportSchema,
  destination: airportSchema,
  departureAt: isoDateTimeSchema,
  arrivalAt: isoDateTimeSchema,
  status: flightStatusSchema,
  availableSeats: z.number().int().min(0),
});

export const flightAvailabilitySchema = z.object({
  flightInstanceId: idSchema,
  capacity: z.number().int().positive(),
  availableSeats: z.number().int().min(0),
});

export const passengerInputSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  documentNumber: documentNumberSchema,
});

export const createReservationRequestSchema = z.object({
  flightInstanceId: idSchema,
  passengers: z.array(passengerInputSchema).min(1).max(9),
  contactEmail: z.email().max(254),
});

export const createReservationResponseSchema = z.object({
  code: reservationCodeSchema,
  status: z.literal("CONFIRMED"),
  message: z.literal("Reserva gratuita confirmada"),
});

export const reservationLookupQuerySchema = z.object({
  documentNumber: documentNumberSchema,
});

export const publicReservationSchema = z.object({
  code: reservationCodeSchema,
  status: reservationStatusSchema,
  flightNumber: flightNumberSchema,
  origin: airportCodeSchema,
  destination: airportCodeSchema,
  departureAt: isoDateTimeSchema,
  passengerCount: z.number().int().positive(),
});

export const cancelReservationRequestSchema = z.object({
  documentNumber: documentNumberSchema,
});

export const cancelReservationResponseSchema = z.object({
  code: reservationCodeSchema,
  status: z.literal("CANCELLED"),
  restoredSeats: z.number().int().positive(),
});

export const publicFlightStatusSchema = z.object({
  flightNumber: flightNumberSchema,
  status: flightStatusSchema,
  departureAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type AirportResponse = z.infer<typeof airportSchema>;
export type FlightSearchQuery = z.infer<typeof flightSearchQuerySchema>;
export type PublicFlight = z.infer<typeof publicFlightSchema>;
export type FlightAvailability = z.infer<typeof flightAvailabilitySchema>;
export type PassengerInput = z.infer<typeof passengerInputSchema>;
export type CreateReservationRequest = z.infer<typeof createReservationRequestSchema>;
export type CreateReservationResponse = z.infer<typeof createReservationResponseSchema>;
export type ReservationLookupQuery = z.infer<typeof reservationLookupQuerySchema>;
export type PublicReservation = z.infer<typeof publicReservationSchema>;
export type CancelReservationRequest = z.infer<typeof cancelReservationRequestSchema>;
export type CancelReservationResponse = z.infer<typeof cancelReservationResponseSchema>;
export type PublicFlightStatus = z.infer<typeof publicFlightStatusSchema>;
