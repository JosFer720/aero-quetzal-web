import type {
  AircraftRepository,
  AirportRepository,
  AuditEventRepository,
  CheckInRepository,
  CreateAircraftInput,
  CreateAirportInput,
  CreateAuditEventInput,
  CreateFlightInput,
  CreateFlightInstanceInput,
  CreatePassengerInput,
  CreateReservationInput,
  FlightInstanceRepository,
  FlightRepository,
  FlightSearchCriteria,
  FlightSearchResult,
  PassengerRepository,
  ReservationRepository,
  ReservationStatus,
} from "@aeroquetzal/domain";
import { Prisma } from "../generated/prisma/client.js";
import type { PrismaClient } from "../generated/prisma/client.js";

import {
  toAircraft,
  toAirport,
  toAuditEvent,
  toCheckIn,
  toFlight,
  toFlightInstance,
  toPassenger,
  toReservation,
  toReservationPassenger,
  toSeatAssignment,
} from "./mappers.js";

type PrismaConnection = PrismaClient | Prisma.TransactionClient;

export class PrismaAirportRepository implements AirportRepository {
  constructor(private readonly db: PrismaConnection) {}

  async listActive() {
    const rows = await this.db.airport.findMany({
      where: { active: true },
      orderBy: { code: "asc" },
    });
    return rows.map(toAirport);
  }

  async findByCode(code: string) {
    const row = await this.db.airport.findUnique({ where: { code } });
    return row ? toAirport(row) : null;
  }

  async create(input: CreateAirportInput) {
    return toAirport(await this.db.airport.create({ data: input }));
  }
}

export class PrismaAircraftRepository implements AircraftRepository {
  constructor(private readonly db: PrismaConnection) {}

  async findByRegistration(registration: string) {
    const row = await this.db.aircraft.findUnique({ where: { registration } });
    return row ? toAircraft(row) : null;
  }

  async create(input: CreateAircraftInput) {
    return toAircraft(await this.db.aircraft.create({ data: input }));
  }
}

export class PrismaFlightRepository implements FlightRepository {
  constructor(private readonly db: PrismaConnection) {}

  async findById(id: string) {
    const row = await this.db.flight.findUnique({ where: { id } });
    return row ? toFlight(row) : null;
  }

  async findByNumber(flightNumber: string) {
    const row = await this.db.flight.findUnique({ where: { flightNumber } });
    return row ? toFlight(row) : null;
  }

  async create(input: CreateFlightInput) {
    return toFlight(await this.db.flight.create({ data: input }));
  }
}

export class PrismaFlightInstanceRepository implements FlightInstanceRepository {
  constructor(private readonly db: PrismaConnection) {}

  async findById(id: string) {
    const row = await this.db.flightInstance.findUnique({ where: { id } });
    return row ? toFlightInstance(row) : null;
  }

  async search(criteria: FlightSearchCriteria): Promise<FlightSearchResult[]> {
    const rows = await this.db.flightInstance.findMany({
      where: {
        departureAt: {
          gte: criteria.departureFrom,
          lt: criteria.departureTo,
        },
        status: { not: "CANCELLED" },
        flight: {
          active: true,
          origin: { code: criteria.originCode, active: true },
          destination: { code: criteria.destinationCode, active: true },
        },
      },
      include: {
        flight: { include: { origin: true, destination: true } },
        aircraft: true,
      },
      orderBy: { departureAt: "asc" },
    });

    return rows.map((row) => ({
      instance: toFlightInstance(row),
      flight: toFlight(row.flight),
      origin: toAirport(row.flight.origin),
      destination: toAirport(row.flight.destination),
      aircraft: toAircraft(row.aircraft),
      availableSeats: row.capacity - row.reservedSeats,
    }));
  }

  async create(input: CreateFlightInstanceInput) {
    return toFlightInstance(
      await this.db.flightInstance.create({
        data: { ...input, reservedSeats: 0 },
      }),
    );
  }

  async adjustReservedSeats(id: string, delta: number) {
    if (!Number.isInteger(delta) || delta === 0) {
      throw new TypeError("El ajuste de inventario debe ser un entero distinto de cero");
    }

    return toFlightInstance(
      await this.db.flightInstance.update({
        where: { id },
        data: {
          reservedSeats:
            delta > 0 ? { increment: delta } : { decrement: Math.abs(delta) },
        },
      }),
    );
  }
}

export class PrismaPassengerRepository implements PassengerRepository {
  constructor(private readonly db: PrismaConnection) {}

  async findByDocument(documentNumber: string) {
    const row = await this.db.passenger.findUnique({ where: { documentNumber } });
    return row ? toPassenger(row) : null;
  }

  async create(input: CreatePassengerInput) {
    return toPassenger(await this.db.passenger.create({ data: input }));
  }
}

export class PrismaReservationRepository implements ReservationRepository {
  constructor(private readonly db: PrismaConnection) {}

  async findByCode(code: string) {
    const row = await this.db.reservation.findUnique({ where: { code } });
    return row ? toReservation(row) : null;
  }

  async create(input: CreateReservationInput) {
    return toReservation(
      await this.db.reservation.create({
        data: { ...input, cancelledAt: null },
      }),
    );
  }

  async updateStatus(
    id: string,
    status: ReservationStatus,
    cancelledAt: Date | null = null,
  ) {
    return toReservation(
      await this.db.reservation.update({
        where: { id },
        data: { status, cancelledAt },
      }),
    );
  }

  async addPassenger(reservationId: string, passengerId: string) {
    return toReservationPassenger(
      await this.db.reservationPassenger.create({
        data: { reservationId, passengerId },
      }),
    );
  }
}

export class PrismaCheckInRepository implements CheckInRepository {
  constructor(private readonly db: PrismaConnection) {}

  async findByReservationPassenger(reservationPassengerId: string) {
    const row = await this.db.checkIn.findUnique({
      where: { reservationPassengerId },
    });
    return row ? toCheckIn(row) : null;
  }

  async create(reservationPassengerId: string, performedBy: string) {
    return toCheckIn(
      await this.db.checkIn.create({
        data: { reservationPassengerId, performedBy },
      }),
    );
  }

  async assignSeat(
    reservationPassengerId: string,
    flightInstanceId: string,
    seatNumber: string,
  ) {
    return toSeatAssignment(
      await this.db.seatAssignment.create({
        data: { reservationPassengerId, flightInstanceId, seatNumber },
      }),
    );
  }
}

export class PrismaAuditEventRepository implements AuditEventRepository {
  constructor(private readonly db: PrismaConnection) {}

  async create(input: CreateAuditEventInput) {
    const data: Prisma.AuditEventCreateInput = {
      actor: input.actor,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      ...(input.details === null
        ? { details: Prisma.JsonNull }
        : input.details === undefined
          ? {}
          : { details: input.details as Prisma.InputJsonValue }),
    };

    return toAuditEvent(
      await this.db.auditEvent.create({
        data,
      }),
    );
  }

  async listRecent(limit: number) {
    const rows = await this.db.auditEvent.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toAuditEvent);
  }
}

export function createRepositories(db: PrismaConnection) {
  return {
    airports: new PrismaAirportRepository(db),
    aircraft: new PrismaAircraftRepository(db),
    flights: new PrismaFlightRepository(db),
    flightInstances: new PrismaFlightInstanceRepository(db),
    passengers: new PrismaPassengerRepository(db),
    reservations: new PrismaReservationRepository(db),
    checkIns: new PrismaCheckInRepository(db),
    auditEvents: new PrismaAuditEventRepository(db),
  };
}
