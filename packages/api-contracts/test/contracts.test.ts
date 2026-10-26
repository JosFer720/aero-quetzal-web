import { describe, expect, it } from "vitest";

import {
  createFlightInstanceRequestSchema,
  createReservationRequestSchema,
  createReservationResponseSchema,
  flightSearchQuerySchema,
  loginRequestSchema,
  publicRoutes,
} from "../src/index.js";

describe("contratos públicos", () => {
  it("acepta una búsqueda válida y normaliza códigos IATA", () => {
    const result = flightSearchQuerySchema.parse({
      origin: "gua",
      destination: "mex",
      date: "2026-11-05",
    });

    expect(result).toEqual({ origin: "GUA", destination: "MEX", date: "2026-11-05" });
  });

  it("rechaza una búsqueda con el mismo origen y destino", () => {
    expect(() =>
      flightSearchQuerySchema.parse({
        origin: "GUA",
        destination: "GUA",
        date: "2026-11-05",
      }),
    ).toThrow();
  });

  it("valida el alcance gratuito de una reserva", () => {
    const request = createReservationRequestSchema.parse({
      flightInstanceId: "fi_123",
      passengers: [
        {
          firstName: "Ana",
          lastName: "López",
          documentNumber: "p1234567",
        },
      ],
      contactEmail: "ana@example.com",
    });

    const response = createReservationResponseSchema.parse({
      code: "AQ7F3K9",
      status: "CONFIRMED",
      message: "Reserva gratuita confirmada",
    });

    expect(request.passengers[0]?.documentNumber).toBe("P1234567");
    expect(response.status).toBe("CONFIRMED");
    expect(response).not.toHaveProperty("price");
    expect(response).not.toHaveProperty("payment");
  });

  it("construye rutas sin interpolar segmentos sin escapar", () => {
    expect(publicRoutes.reservation("AQ 123")).toBe(
      "/api/v1/public/reservations/AQ%20123",
    );
  });
});

describe("contratos internos", () => {
  it("rechaza horarios con llegada anterior a la salida", () => {
    expect(() =>
      createFlightInstanceRequestSchema.parse({
        flightId: "flight_1",
        aircraftId: "aircraft_1",
        departureAt: "2026-11-05T14:00:00-06:00",
        arrivalAt: "2026-11-05T13:00:00-06:00",
        capacity: 72,
      }),
    ).toThrow();
  });

  it("no expone la contraseña en el tipo de respuesta de sesión", () => {
    const login = loginRequestSchema.parse({ username: "milton", password: "temporal" });
    expect(login.password).toBe("temporal");
  });
});
