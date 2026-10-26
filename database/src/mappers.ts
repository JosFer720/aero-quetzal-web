import type {
  Aircraft,
  Airport,
  AuditEvent,
  CheckIn,
  Flight,
  FlightInstance,
  Passenger,
  Reservation,
  ReservationPassenger,
  SeatAssignment,
} from "@aeroquetzal/domain";
import type {
  Aircraft as PrismaAircraft,
  Airport as PrismaAirport,
  AuditEvent as PrismaAuditEvent,
  CheckIn as PrismaCheckIn,
  Flight as PrismaFlight,
  FlightInstance as PrismaFlightInstance,
  Passenger as PrismaPassenger,
  Reservation as PrismaReservation,
  ReservationPassenger as PrismaReservationPassenger,
  SeatAssignment as PrismaSeatAssignment,
} from "../generated/prisma/client.js";

export const toAirport = (value: PrismaAirport): Airport => value;
export const toAircraft = (value: PrismaAircraft): Aircraft => value;
export const toFlight = (value: PrismaFlight): Flight => value;

export const toFlightInstance = (
  value: PrismaFlightInstance,
): FlightInstance => ({
  ...value,
  status: value.status,
});

export const toPassenger = (value: PrismaPassenger): Passenger => value;

export const toReservation = (value: PrismaReservation): Reservation => ({
  ...value,
  status: value.status,
});

export const toReservationPassenger = (
  value: PrismaReservationPassenger,
): ReservationPassenger => value;

export const toSeatAssignment = (
  value: PrismaSeatAssignment,
): SeatAssignment => value;

export const toCheckIn = (value: PrismaCheckIn): CheckIn => value;

export const toAuditEvent = (value: PrismaAuditEvent): AuditEvent => ({
  ...value,
  details: value.details,
});
