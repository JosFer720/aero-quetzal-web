import type {
  AirportResponse,
  PublicFlight,
  PublicReservation,
} from "@aeroquetzal/api-contracts";

export const airports: AirportResponse[] = [
  {
    code: "GUA",
    name: "La Aurora",
    city: "Ciudad de Guatemala",
    country: "Guatemala",
  },
  {
    code: "SAL",
    name: "El Salvador",
    city: "San Salvador",
    country: "El Salvador",
  },
];
export const flight: PublicFlight = {
  id: "instance-1",
  flightNumber: "AQ118",
  origin: airports[0]!,
  destination: airports[1]!,
  departureAt: "2099-11-05T17:00:00-06:00",
  arrivalAt: "2099-11-05T17:50:00-06:00",
  status: "SCHEDULED",
  availableSeats: 2,
};
export const reservation: PublicReservation = {
  code: "AQ7F3K9",
  status: "CONFIRMED",
  flightNumber: flight.flightNumber,
  origin: "GUA",
  destination: "SAL",
  departureAt: flight.departureAt,
  passengerCount: 1,
};
export const confirmation = {
  code: reservation.code,
  status: "CONFIRMED",
  message: "Reserva gratuita confirmada",
} as const;
export const passenger = {
  firstName: "Ana",
  lastName: "López",
  documentNumber: "P1234567",
};
export const bookingRequest = {
  flightInstanceId: flight.id,
  passengers: [passenger],
  contactEmail: "ana@example.com",
};
export function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
