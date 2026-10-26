import { describe, expect, it } from "vitest";

import {
  assertCanReserve,
  assertFlightTransition,
  assertReservationTransition,
  calculateAvailableSeats,
  canTransitionFlight,
  canTransitionReservation,
  DomainRuleError,
  normalizeAirportCode,
  normalizeDocumentNumber,
  normalizeFlightNumber,
} from "../src/index.js";

describe("reglas de reserva", () => {
  it("permite confirmar check-in o cancelar una reserva confirmada", () => {
    expect(canTransitionReservation("CONFIRMED", "CHECKED_IN")).toBe(true);
    expect(canTransitionReservation("CONFIRMED", "CANCELLED")).toBe(true);
  });

  it("impide cancelar una reserva con check-in", () => {
    expect(() =>
      assertReservationTransition("CHECKED_IN", "CANCELLED"),
    ).toThrow(DomainRuleError);
  });

  it("impide reservar más asientos que los disponibles", () => {
    expect(calculateAvailableSeats(12, 9)).toBe(3);
    expect(() => assertCanReserve(12, 9, 4)).toThrow(
      "No hay suficientes asientos disponibles",
    );
  });
});

describe("reglas de vuelo", () => {
  it("acepta únicamente la secuencia operacional definida", () => {
    expect(canTransitionFlight("SCHEDULED", "BOARDING")).toBe(true);
    expect(canTransitionFlight("BOARDING", "DEPARTED")).toBe(true);
    expect(canTransitionFlight("DEPARTED", "ARRIVED")).toBe(true);
    expect(() => assertFlightTransition("ARRIVED", "SCHEDULED")).toThrow(
      DomainRuleError,
    );
  });
});

describe("normalización de identificadores", () => {
  it("normaliza aeropuertos, vuelos y documentos", () => {
    expect(normalizeAirportCode(" gua ")).toBe("GUA");
    expect(normalizeFlightNumber(" aq101 ")).toBe("AQ101");
    expect(normalizeDocumentNumber(" p123-456 ")).toBe("P123-456");
  });

  it("rechaza formatos fuera del dominio", () => {
    expect(() => normalizeAirportCode("GUAT")).toThrow(DomainRuleError);
    expect(() => normalizeFlightNumber("AV101")).toThrow(DomainRuleError);
    expect(() => normalizeDocumentNumber("12")).toThrow(DomainRuleError);
  });
});
