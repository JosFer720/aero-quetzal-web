import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { App } from "../src/app";
import {
  aircraft,
  airports,
  flight,
  instance,
  reservation,
  session,
} from "./fixtures";
import type { SessionResponse } from "@aeroquetzal/api-contracts";

export { deferred } from "./deferred";

export function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
export function mockApi(
  auth: SessionResponse = session(),
  override?: (
    path: string,
    init: RequestInit | undefined,
  ) => Response | undefined | Promise<Response | undefined>,
) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const response = await override?.(path, init);
    if (response) return response;
    if (path === "/api/v1/auth/session") return json(auth);
    if (path === "/api/v1/internal/dashboard")
      return json({
        scheduledFlights: 4,
        boardingFlights: 1,
        confirmedReservations: 5,
        checkedInPassengers: 2,
      });
    if (path === "/api/v1/internal/flights") return json([flight]);
    if (path === "/api/v1/internal/airports") return json(airports);
    if (path === "/api/v1/internal/aircraft") return json(aircraft);
    if (path === "/api/v1/internal/flight-instances") return json([instance]);
    if (path === "/api/v1/internal/reservations/" + reservation.code)
      return json(reservation);
    if (path.startsWith("/api/v1/internal/reservations?"))
      return json([reservation]);
    if (path === "/api/v1/internal/audit")
      return json([
        {
          id: "audit-1",
          actor: "javier",
          action: "CHECK_IN",
          entityType: "Reservation",
          entityId: reservation.id,
          details: { code: reservation.code },
          createdAt: "2026-10-27T15:00:00.000Z",
        },
      ]);
    return json(
      { code: "NOT_FOUND", message: "No se encontró el registro" },
      404,
    );
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}
export function renderApp(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
