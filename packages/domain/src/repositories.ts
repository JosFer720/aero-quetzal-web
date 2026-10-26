import type {
  Aircraft,
  Airport,
  AuditEvent,
  CheckIn,
  Flight,
  FlightInstance,
  FlightSearchCriteria,
  FlightSearchResult,
  Passenger,
  Reservation,
  ReservationPassenger,
  ReservationStatus,
  SeatAssignment,
} from "./entities.js";

export type CreateAirportInput = Omit<Airport, "id" | "createdAt" | "updatedAt">;
export type CreateAircraftInput = Omit<Aircraft, "id" | "createdAt" | "updatedAt">;
export type CreateFlightInput = Omit<Flight, "id" | "createdAt" | "updatedAt">;
export type CreateFlightInstanceInput = Omit<
  FlightInstance,
  "id" | "createdAt" | "updatedAt" | "reservedSeats"
>;
export type CreatePassengerInput = Omit<Passenger, "id" | "createdAt" | "updatedAt">;
export type CreateReservationInput = Omit<
  Reservation,
  "id" | "cancelledAt" | "createdAt" | "updatedAt"
>;
export type CreateAuditEventInput = Omit<AuditEvent, "id" | "createdAt">;

export interface AirportRepository {
  listActive(): Promise<Airport[]>;
  findByCode(code: string): Promise<Airport | null>;
  create(input: CreateAirportInput): Promise<Airport>;
}

export interface AircraftRepository {
  findByRegistration(registration: string): Promise<Aircraft | null>;
  create(input: CreateAircraftInput): Promise<Aircraft>;
}

export interface FlightRepository {
  findById(id: string): Promise<Flight | null>;
  findByNumber(flightNumber: string): Promise<Flight | null>;
  create(input: CreateFlightInput): Promise<Flight>;
}

export interface FlightInstanceRepository {
  findById(id: string): Promise<FlightInstance | null>;
  search(criteria: FlightSearchCriteria): Promise<FlightSearchResult[]>;
  create(input: CreateFlightInstanceInput): Promise<FlightInstance>;
  adjustReservedSeats(id: string, delta: number): Promise<FlightInstance>;
}

export interface PassengerRepository {
  findByDocument(documentNumber: string): Promise<Passenger | null>;
  create(input: CreatePassengerInput): Promise<Passenger>;
}

export interface ReservationRepository {
  findByCode(code: string): Promise<Reservation | null>;
  create(input: CreateReservationInput): Promise<Reservation>;
  updateStatus(
    id: string,
    status: ReservationStatus,
    cancelledAt?: Date | null,
  ): Promise<Reservation>;
  addPassenger(
    reservationId: string,
    passengerId: string,
  ): Promise<ReservationPassenger>;
}

export interface CheckInRepository {
  findByReservationPassenger(
    reservationPassengerId: string,
  ): Promise<CheckIn | null>;
  create(
    reservationPassengerId: string,
    performedBy: string,
  ): Promise<CheckIn>;
  assignSeat(
    reservationPassengerId: string,
    flightInstanceId: string,
    seatNumber: string,
  ): Promise<SeatAssignment>;
}

export interface AuditEventRepository {
  create(input: CreateAuditEventInput): Promise<AuditEvent>;
  listRecent(limit: number): Promise<AuditEvent[]>;
}
