import { describe, expect, it } from "vitest";
import {
  internalFlightSchema,
  internalFlightInstanceSchema,
  internalAircraftSchema,
  internalReservationSearchSchema,
  internalRoutes,
} from "../src/index.js";

describe("contratos de lectura de intranet", () => {
  const flight = {
    id: "f1",
    flightNumber: "AQ101",
    origin: "GUA",
    destination: "MEX",
    durationMinutes: 150,
    active: true,
  };
  const instance = {
    id: "fi1",
    flightId: "f1",
    aircraftId: "a1",
    flightNumber: "AQ101",
    origin: "GUA",
    destination: "MEX",
    departureAt: "2026-11-05T13:00:00Z",
    arrivalAt: "2026-11-05T15:30:00Z",
    status: "SCHEDULED",
    capacity: 72,
    reservedSeats: 2,
    availableSeats: 70,
  };
  it("valida vuelos y rechaza origen igual a destino", () => {
    expect(internalFlightSchema.parse(flight)).toEqual(flight);
    expect(
      internalFlightSchema.safeParse({ ...flight, destination: "GUA" }).success,
    ).toBe(false);
  });
  it("rechaza inventarios inconsistentes y horarios invertidos", () => {
    expect(internalFlightInstanceSchema.parse(instance)).toEqual(instance);
    expect(
      internalFlightInstanceSchema.safeParse({
        ...instance,
        availableSeats: 72,
      }).success,
    ).toBe(false);
    expect(
      internalFlightInstanceSchema.safeParse({
        ...instance,
        arrivalAt: "2026-11-05T12:00:00Z",
      }).success,
    ).toBe(false);
  });
  it("requiere aeronaves válidas y acota la búsqueda de pasajeros", () => {
    expect(
      internalAircraftSchema.safeParse({
        id: "a1",
        registration: "TG-AQ01",
        model: "ATR 72",
        active: true,
        capacity: 0,
      }).success,
    ).toBe(false);
    expect(internalReservationSearchSchema.parse({ q: " Ana " })).toEqual({
      q: "Ana",
    });
    expect(internalReservationSearchSchema.safeParse({ q: " " }).success).toBe(
      false,
    );
    expect(
      internalReservationSearchSchema.safeParse({ q: "a".repeat(121) }).success,
    ).toBe(false);
  });
  it("mantiene los catálogos exclusivamente bajo el prefijo interno", () => {
    expect(internalRoutes.airports).toBe("/api/v1/internal/airports");
    expect(internalRoutes.aircraft).toBe("/api/v1/internal/aircraft");
  });
});
