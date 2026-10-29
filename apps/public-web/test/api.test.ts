import { describe, expect, it, vi } from "vitest";
import { createPublicApi } from "../src/api";
import {
  airports,
  bookingRequest,
  confirmation,
  flight,
  json,
  reservation,
} from "./fixtures";

describe("cliente público tipado", () => {
  it("usa rutas públicas relativas, normaliza la búsqueda y omite cookies", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(json([flight]));
    await createPublicApi(send).flights({
      origin: "gua",
      destination: "sal",
      date: "2099-11-05",
    });
    expect(send).toHaveBeenCalledWith(
      "/api/v1/public/flights?origin=GUA&destination=SAL&date=2099-11-05",
      expect.objectContaining({
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        method: "GET",
      }),
    );
  });
  it("valida la petición antes de llamar a la red", () => {
    const send = vi.fn<typeof fetch>();
    expect(() =>
      createPublicApi(send).reserve({ ...bookingRequest, passengers: [] }),
    ).toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it("serializa la reserva gratuita y no añade datos de pago", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(json(confirmation));
    await expect(
      createPublicApi(send).reserve(bookingRequest),
    ).resolves.toEqual(confirmation);
    expect(send).toHaveBeenCalledWith(
      "/api/v1/public/reservations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(bookingRequest),
      }),
    );
  });
  it("normaliza el código y exige documento tanto para consultar como cancelar", async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(reservation))
      .mockResolvedValueOnce(
        json({ code: reservation.code, status: "CANCELLED", restoredSeats: 1 }),
      );
    const api = createPublicApi(send);
    await api.reservation("aq7f3k9", "p1234567");
    await api.cancel("aq7f3k9", "p1234567");
    expect(send.mock.calls[0]?.[0]).toBe(
      "/api/v1/public/reservations/AQ7F3K9?documentNumber=P1234567",
    );
    expect(send.mock.calls[1]?.[1]?.body).toBe('{"documentNumber":"P1234567"}');
  });
  it.each([404, 409, 429, 500])(
    "traduce el error HTTP %s sin mostrar detalles privados",
    async (status) => {
      const send = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          json({ code: "INTERNAL", message: "secret-private-value" }, status),
        );
      await expect(createPublicApi(send).airports()).rejects.toMatchObject({
        status,
      });
      await expect(createPublicApi(send).airports()).rejects.not.toThrow(
        "secret-private-value",
      );
    },
  );
  it("rechaza un JSON válido con estructura incorrecta", async () => {
    const api = createPublicApi(
      vi.fn<typeof fetch>().mockResolvedValue(json({ airports })),
    );
    await expect(api.airports()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
  it("rechaza cupos inconsistentes o correspondientes a otro vuelo", async () => {
    const api = createPublicApi(
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          json({ flightInstanceId: "other", capacity: 2, availableSeats: 1 }),
        )
        .mockResolvedValueOnce(
          json({ flightInstanceId: flight.id, capacity: 2, availableSeats: 3 }),
        ),
    );
    await expect(api.availability(flight.id)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
    await expect(api.availability(flight.id)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
  it("rechaza una reserva distinta de la solicitada", async () => {
    await expect(
      createPublicApi(
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(json({ ...reservation, code: "AQ00001" })),
      ).reservation(reservation.code, "P1234567"),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("no reenvía automáticamente una reserva si se pierde la conexión", async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("offline"));
    await expect(createPublicApi(send).reserve(bookingRequest)).rejects.toThrow(
      "Consulta tu reserva antes de repetir",
    );
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("conserva la cancelación de una lectura", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      createPublicApi(
        vi.fn<typeof fetch>().mockResolvedValue(json(airports)),
      ).airports(controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
