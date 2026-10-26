import type { FlightStatus, ReservationStatus } from "./entities.js";

const reservationTransitions: Readonly<
  Record<ReservationStatus, readonly ReservationStatus[]>
> = {
  CONFIRMED: ["CHECKED_IN", "CANCELLED"],
  CHECKED_IN: [],
  CANCELLED: [],
};

const flightTransitions: Readonly<Record<FlightStatus, readonly FlightStatus[]>> = {
  SCHEDULED: ["BOARDING", "CANCELLED"],
  BOARDING: ["DEPARTED"],
  DEPARTED: ["ARRIVED"],
  ARRIVED: [],
  CANCELLED: [],
};

export class DomainRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainRuleError";
  }
}

export function canTransitionReservation(
  current: ReservationStatus,
  next: ReservationStatus,
): boolean {
  return reservationTransitions[current].includes(next);
}

export function assertReservationTransition(
  current: ReservationStatus,
  next: ReservationStatus,
): void {
  if (!canTransitionReservation(current, next)) {
    throw new DomainRuleError(
      `La reserva no puede cambiar de ${current} a ${next}`,
    );
  }
}

export function canTransitionFlight(
  current: FlightStatus,
  next: FlightStatus,
): boolean {
  return flightTransitions[current].includes(next);
}

export function assertFlightTransition(
  current: FlightStatus,
  next: FlightStatus,
): void {
  if (!canTransitionFlight(current, next)) {
    throw new DomainRuleError(
      `El vuelo no puede cambiar de ${current} a ${next}`,
    );
  }
}

export function calculateAvailableSeats(
  capacity: number,
  reservedSeats: number,
): number {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new DomainRuleError("La capacidad debe ser un entero positivo");
  }

  if (
    !Number.isInteger(reservedSeats) ||
    reservedSeats < 0 ||
    reservedSeats > capacity
  ) {
    throw new DomainRuleError("La cantidad de asientos reservados no es válida");
  }

  return capacity - reservedSeats;
}

export function assertCanReserve(
  capacity: number,
  reservedSeats: number,
  requestedSeats: number,
): void {
  if (!Number.isInteger(requestedSeats) || requestedSeats <= 0) {
    throw new DomainRuleError("La reserva debe incluir al menos un pasajero");
  }

  if (requestedSeats > calculateAvailableSeats(capacity, reservedSeats)) {
    throw new DomainRuleError("No hay suficientes asientos disponibles");
  }
}

export function normalizeAirportCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new DomainRuleError("El código de aeropuerto debe tener tres letras");
  }
  return code;
}

export function normalizeFlightNumber(value: string): string {
  const flightNumber = value.trim().toUpperCase();
  if (!/^AQ\d{3,4}$/.test(flightNumber)) {
    throw new DomainRuleError("El número de vuelo debe usar el formato AQ seguido de 3 o 4 dígitos");
  }
  return flightNumber;
}

export function normalizeDocumentNumber(value: string): string {
  const documentNumber = value.trim().toUpperCase();
  if (!/^[A-Z0-9-]{5,24}$/.test(documentNumber)) {
    throw new DomainRuleError("El número de documento no es válido");
  }
  return documentNumber;
}
