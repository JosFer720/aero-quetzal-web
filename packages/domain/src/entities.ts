export const RESERVATION_STATUSES = [
  "CONFIRMED",
  "CHECKED_IN",
  "CANCELLED",
] as const;

export const FLIGHT_STATUSES = [
  "SCHEDULED",
  "BOARDING",
  "DEPARTED",
  "ARRIVED",
  "CANCELLED",
] as const;

export const APP_ROLES = [
  "admin",
  "operator",
  "checkin_agent",
  "viewer",
] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];
export type FlightStatus = (typeof FLIGHT_STATUSES)[number];
export type AppRole = (typeof APP_ROLES)[number];

export interface Airport {
  id: string;
  code: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Aircraft {
  id: string;
  registration: string;
  model: string;
  capacity: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Flight {
  id: string;
  flightNumber: string;
  originId: string;
  destinationId: string;
  durationMinutes: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FlightInstance {
  id: string;
  flightId: string;
  aircraftId: string;
  departureAt: Date;
  arrivalAt: Date;
  status: FlightStatus;
  capacity: number;
  reservedSeats: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Passenger {
  id: string;
  firstName: string;
  lastName: string;
  documentNumber: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Reservation {
  id: string;
  code: string;
  flightInstanceId: string;
  contactEmail: string;
  status: ReservationStatus;
  passengerCount: number;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReservationPassenger {
  id: string;
  reservationId: string;
  passengerId: string;
  createdAt: Date;
}

export interface SeatAssignment {
  id: string;
  reservationPassengerId: string;
  flightInstanceId: string;
  seatNumber: string;
  createdAt: Date;
}

export interface CheckIn {
  id: string;
  reservationPassengerId: string;
  performedBy: string;
  checkedInAt: Date;
}

export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  details: unknown;
  createdAt: Date;
}

export interface PassengerInput {
  firstName: string;
  lastName: string;
  documentNumber: string;
}

export interface FlightSearchCriteria {
  originCode: string;
  destinationCode: string;
  departureFrom: Date;
  departureTo: Date;
}

export interface FlightSearchResult {
  instance: FlightInstance;
  flight: Flight;
  origin: Airport;
  destination: Airport;
  aircraft: Aircraft;
  availableSeats: number;
}
