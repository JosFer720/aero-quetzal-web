import { describe, expect, it } from "vitest";
import { readBusinessConfig } from "../src/config.js";
import { reservationCode, seatNumber, searchRange } from "../src/service.js";

describe("configuración y reglas de API", () => {
  it("produce códigos válidos sin usar contadores predecibles", () => {
    const codes = Array.from({ length: 500 }, reservationCode);
    expect(codes.every((code) => /^AQ[A-Z0-9]{5}$/.test(code))).toBe(true);
    expect(new Set(codes).size).toBeGreaterThan(490);
  });
  it("asigna asientos en orden hasta la capacidad máxima acordada", () => {
    expect([0, 5, 6, 599].map(seatNumber)).toEqual(["1A", "1F", "2A", "100F"]);
  });
  it("interpreta fechas públicas en Guatemala incluyendo cambio de año", () => {
    expect(searchRange("2099-12-31")).toEqual({
      departureFrom: new Date("2099-12-31T06:00:00Z"), departureTo: new Date("2100-01-01T06:00:00Z"),
    });
  });
  it("exige token de servicio y HTTPS en producción", () => {
    expect(() => readBusinessConfig({ NODE_ENV: "production" })).toThrow();
    expect(() => readBusinessConfig({ AUTH_URL: "http://user:secret@auth" })).toThrow();
    expect(() => readBusinessConfig({ TRUSTED_PROXIES: "0.0.0.0/0" })).toThrow();
    expect(readBusinessConfig({ NODE_ENV: "production", PUBLIC_GATEWAY_TOKEN: "x".repeat(48), AUTH_ORIGIN: "https://intranet.example" }).BUSINESS_PORT).toBe(8080);
  });
});
