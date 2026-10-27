import type {
  SessionResponse,
  InternalFlight,
  InternalFlightInstance,
  InternalReservation,
  InternalAirport,
  InternalAircraft,
} from "@aeroquetzal/api-contracts";
import type { AppRole } from "@aeroquetzal/domain";

export function session(roles: AppRole[] = ["admin"]): SessionResponse {
  return {
    authenticated: true,
    user: { username: "javier", displayName: "Javier", roles },
    csrfToken: "test-csrf-token",
    expiresAt: new Date(Date.now() + 1800000).toISOString(),
  };
}
export const anonymous: SessionResponse = {
  authenticated: false,
  user: null,
  csrfToken: null,
  expiresAt: null,
};
export const flight: InternalFlight = {
  id: "flight-1",
  flightNumber: "AQ101",
  origin: "GUA",
  destination: "MEX",
  durationMinutes: 150,
  active: true,
};
export const instance: InternalFlightInstance = {
  id: "instance-1",
  flightId: flight.id,
  aircraftId: "aircraft-1",
  flightNumber: flight.flightNumber,
  origin: "GUA",
  destination: "MEX",
  departureAt: "2026-11-05T13:00:00.000Z",
  arrivalAt: "2026-11-05T15:30:00.000Z",
  status: "SCHEDULED",
  capacity: 72,
  reservedSeats: 1,
  availableSeats: 71,
};
export const reservation: InternalReservation = {
  id: "reservation-1",
  code: "AQ7F3K9",
  status: "CONFIRMED",
  contactEmail: "ana@example.com",
  flightInstanceId: instance.id,
  passengers: [
    {
      id: "passenger-1",
      firstName: "Ana",
      lastName: "López",
      documentNumber: "P1234567",
      seatNumber: null,
      checkedInAt: null,
    },
  ],
  createdAt: "2026-10-27T15:00:00.000Z",
};
export const airports: InternalAirport[] = [
  {
    id: "airport-1",
    code: "GUA",
    name: "La Aurora",
    city: "Guatemala",
    country: "Guatemala",
    active: true,
  },
  {
    id: "airport-2",
    code: "MEX",
    name: "Ciudad de México",
    city: "Ciudad de México",
    country: "México",
    active: true,
  },
];
export const aircraft: InternalAircraft[] = [
  {
    id: "aircraft-1",
    registration: "TG-AQ01",
    model: "ATR 72-600",
    capacity: 72,
    active: true,
  },
];
