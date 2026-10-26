import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import {
  PrismaAirportRepository,
  PrismaAuditEventRepository,
  PrismaCheckInRepository,
  PrismaFlightInstanceRepository,
  PrismaReservationRepository,
} from "../src/index.js";

const createdAt = new Date("2026-10-26T12:00:00.000Z");
const updatedAt = new Date("2026-10-26T12:00:00.000Z");

function databaseMock(models: Record<string, unknown>): PrismaClient {
  return models as unknown as PrismaClient;
}

describe("PrismaAirportRepository", () => {
  it("lista únicamente aeropuertos activos en orden de código", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "airport_gua",
        code: "GUA",
        name: "La Aurora",
        city: "Ciudad de Guatemala",
        country: "Guatemala",
        timezone: "America/Guatemala",
        active: true,
        createdAt,
        updatedAt,
      },
    ]);
    const repository = new PrismaAirportRepository(
      databaseMock({ airport: { findMany } }),
    );

    const result = await repository.listActive();

    expect(findMany).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: { code: "asc" },
    });
    expect(result[0]?.code).toBe("GUA");
  });
});

describe("PrismaFlightInstanceRepository", () => {
  it("busca por ruta y fecha y calcula los cupos disponibles", async () => {
    const departureAt = new Date("2026-11-05T13:00:00.000Z");
    const arrivalAt = new Date("2026-11-05T15:30:00.000Z");
    const airportBase = {
      active: true,
      createdAt,
      updatedAt,
    };
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "instance_1",
        flightId: "flight_1",
        aircraftId: "aircraft_1",
        departureAt,
        arrivalAt,
        status: "SCHEDULED",
        capacity: 96,
        reservedSeats: 12,
        createdAt,
        updatedAt,
        flight: {
          id: "flight_1",
          flightNumber: "AQ101",
          originId: "airport_gua",
          destinationId: "airport_mex",
          durationMinutes: 150,
          active: true,
          createdAt,
          updatedAt,
          origin: {
            ...airportBase,
            id: "airport_gua",
            code: "GUA",
            name: "La Aurora",
            city: "Ciudad de Guatemala",
            country: "Guatemala",
            timezone: "America/Guatemala",
          },
          destination: {
            ...airportBase,
            id: "airport_mex",
            code: "MEX",
            name: "Benito Juárez",
            city: "Ciudad de México",
            country: "México",
            timezone: "America/Mexico_City",
          },
        },
        aircraft: {
          id: "aircraft_1",
          registration: "TG-AQ02",
          model: "Embraer E190",
          capacity: 96,
          active: true,
          createdAt,
          updatedAt,
        },
      },
    ]);
    const repository = new PrismaFlightInstanceRepository(
      databaseMock({ flightInstance: { findMany } }),
    );
    const departureFrom = new Date("2026-11-05T06:00:00.000Z");
    const departureTo = new Date("2026-11-06T06:00:00.000Z");

    const result = await repository.search({
      originCode: "GUA",
      destinationCode: "MEX",
      departureFrom,
      departureTo,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          departureAt: { gte: departureFrom, lt: departureTo },
          status: { not: "CANCELLED" },
        }),
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.availableSeats).toBe(84);
    expect(result[0]?.origin.code).toBe("GUA");
    expect(result[0]?.destination.code).toBe("MEX");
  });

  it("ajusta el inventario con una operación atómica", async () => {
    const update = vi.fn().mockResolvedValue({
      id: "instance_1",
      flightId: "flight_1",
      aircraftId: "aircraft_1",
      departureAt: new Date("2026-11-05T13:00:00.000Z"),
      arrivalAt: new Date("2026-11-05T15:30:00.000Z"),
      status: "SCHEDULED",
      capacity: 96,
      reservedSeats: 14,
      createdAt,
      updatedAt,
    });
    const repository = new PrismaFlightInstanceRepository(
      databaseMock({ flightInstance: { update } }),
    );

    await repository.adjustReservedSeats("instance_1", 2);

    expect(update).toHaveBeenCalledWith({
      where: { id: "instance_1" },
      data: { reservedSeats: { increment: 2 } },
    });
  });
});

describe("PrismaReservationRepository", () => {
  it("guarda la fecha de cancelación junto con el estado", async () => {
    const cancelledAt = new Date("2026-10-26T13:00:00.000Z");
    const update = vi.fn().mockResolvedValue({
      id: "reservation_1",
      code: "AQ7F3K9",
      flightInstanceId: "instance_1",
      contactEmail: "ana@example.com",
      status: "CANCELLED",
      passengerCount: 1,
      cancelledAt,
      createdAt,
      updatedAt: cancelledAt,
    });
    const repository = new PrismaReservationRepository(
      databaseMock({ reservation: { update } }),
    );

    const result = await repository.updateStatus(
      "reservation_1",
      "CANCELLED",
      cancelledAt,
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: "reservation_1" },
      data: { status: "CANCELLED", cancelledAt },
    });
    expect(result.cancelledAt).toEqual(cancelledAt);
  });
});

describe("PrismaCheckInRepository", () => {
  it("consulta el check-in existente antes de que el caso de uso intente crearlo", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const repository = new PrismaCheckInRepository(
      databaseMock({ checkIn: { findUnique } }),
    );

    await expect(repository.findByReservationPassenger("rp_1")).resolves.toBeNull();
    expect(findUnique).toHaveBeenCalledWith({
      where: { reservationPassengerId: "rp_1" },
    });
  });
});

describe("PrismaAuditEventRepository", () => {
  it("registra detalles estructurados sin convertirlos a texto", async () => {
    const row = {
      id: "audit_1",
      actor: "milton",
      action: "FLIGHT_CREATED",
      entityType: "Flight",
      entityId: "flight_1",
      details: { flightNumber: "AQ101" },
      createdAt,
    };
    const create = vi.fn().mockResolvedValue(row);
    const repository = new PrismaAuditEventRepository(
      databaseMock({ auditEvent: { create } }),
    );

    const result = await repository.create({
      actor: row.actor,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      details: row.details,
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ details: row.details }),
    });
    expect(result.details).toEqual(row.details);
  });
});
