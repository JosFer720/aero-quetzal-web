// Fixture exclusiva de pruebas: Auth real con directorio simulado y API de negocio en memoria.
// No se importa desde src/ ni se incluye en el build de producción.
import { randomBytes } from "node:crypto";
import Fastify from "fastify";
import {
  buildAuthServer,
  readConfig,
  MockDirectory,
  createAuthGuard,
} from "@aeroquetzal/auth-service";
import {
  internalRoutes,
  createFlightRequestSchema,
  updateFlightRequestSchema,
  createFlightInstanceRequestSchema,
  updateFlightStatusRequestSchema,
  internalReservationSearchSchema,
} from "@aeroquetzal/api-contracts";
import { assertFlightTransition, type AppRole } from "@aeroquetzal/domain";
import {
  aircraft,
  airports,
  flight,
  instance,
  reservation,
} from "../test/fixtures";

if (process.env.NODE_ENV !== "test")
  throw new Error("El servidor E2E sólo puede ejecutarse con NODE_ENV=test");
const origin = "http://127.0.0.1:5174";
const auth = await buildAuthServer({
  config: readConfig({
    NODE_ENV: "test",
    AUTH_MODE: "mock",
    AUTH_ORIGIN: origin,
    SESSION_SECRET: randomBytes(48).toString("hex"),
  }),
  directory: new MockDirectory({
    checkin: {
      password: "e2e-only-password",
      displayName: "Agente E2E",
      groups: ["checkin"],
    },
    admin: {
      password: "e2e-only-password",
      displayName: "Admin E2E",
      groups: ["ti"],
    },
    viewer: {
      password: "e2e-only-password",
      displayName: "Monitor E2E",
      groups: ["monitoreo"],
    },
  }),
});
await auth.listen({ host: "127.0.0.1", port: 18081 });
const api = Fastify();
api.decorateRequest("authUser", null);
let booking = structuredClone(reservation);
const flights = [structuredClone(flight)];
const instances = [structuredClone(instance)];
const events: {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  details: unknown;
  createdAt: string;
}[] = [];
const guard = (roles: AppRole[]) => ({
  onRequest: createAuthGuard({
    authUrl: "http://127.0.0.1:18081",
    origin,
    roles,
  }),
});
api.setErrorHandler((_error, _request, reply) =>
  reply
    .code(400)
    .send({ code: "INVALID_REQUEST", message: "Solicitud inválida" }),
);
api.get("/health", async () => ({ status: "ok" }));
api.get(
  internalRoutes.dashboard,
  guard(["admin", "operator", "checkin_agent", "viewer"]),
  async () => ({
    scheduledFlights: instances.filter((item) => item.status === "SCHEDULED")
      .length,
    boardingFlights: instances.filter((item) => item.status === "BOARDING")
      .length,
    confirmedReservations: booking.status === "CONFIRMED" ? 1 : 0,
    checkedInPassengers: booking.status === "CHECKED_IN" ? 1 : 0,
  }),
);
api.get(internalRoutes.flights, guard(["operator"]), async () => flights);
api.get(internalRoutes.airports, guard(["operator"]), async () => airports);
api.get(internalRoutes.aircraft, guard(["operator"]), async () => aircraft);
api.post(internalRoutes.flights, guard(["operator"]), async (request) => {
  const created = {
    id: "flight-" + (flights.length + 1),
    ...createFlightRequestSchema.parse(request.body),
  };
  flights.push(created);
  return created;
});
api.patch(
  internalRoutes.flights + "/:id",
  guard(["operator"]),
  async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const item = flights.find((row) => row.id === id);
    if (!item)
      return reply
        .code(404)
        .send({ code: "NOT_FOUND", message: "Vuelo no encontrado" });
    Object.assign(item, updateFlightRequestSchema.parse(request.body));
    return item;
  },
);
api.get(
  internalRoutes.flightInstances,
  guard(["operator"]),
  async () => instances,
);
api.post(
  internalRoutes.flightInstances,
  guard(["operator"]),
  async (request) => {
    const body = createFlightInstanceRequestSchema.parse(request.body);
    const selected = flights.find((item) => item.id === body.flightId)!;
    const created = {
      ...instance,
      ...body,
      id: "instance-" + (instances.length + 1),
      flightNumber: selected.flightNumber,
      origin: selected.origin,
      destination: selected.destination,
      reservedSeats: 0,
      availableSeats: body.capacity,
    };
    instances.push(created);
    return created;
  },
);
api.patch(
  internalRoutes.flightInstances + "/:id/status",
  guard(["operator"]),
  async (request) => {
    const selected = instances.find(
      (item) => item.id === (request.params as { id: string }).id,
    )!;
    const body = updateFlightStatusRequestSchema.parse(request.body);
    assertFlightTransition(selected.status, body.status);
    selected.status = body.status;
    return selected;
  },
);
api.get(
  internalRoutes.reservations,
  guard(["operator", "checkin_agent"]),
  async (request) => {
    const { q } = internalReservationSearchSchema.parse(request.query);
    return JSON.stringify(booking).toLowerCase().includes(q.toLowerCase())
      ? [booking]
      : [];
  },
);
api.get(
  internalRoutes.reservations + "/:code",
  guard(["operator", "checkin_agent"]),
  async (request, reply) => {
    if ((request.params as { code: string }).code !== booking.code)
      return reply
        .code(404)
        .send({ code: "NOT_FOUND", message: "Reserva no encontrada" });
    return booking;
  },
);
api.post(
  internalRoutes.reservations + "/:code/check-in",
  guard(["checkin_agent"]),
  async (request, reply) => {
    if ((request.params as { code: string }).code !== booking.code)
      return reply
        .code(404)
        .send({ code: "NOT_FOUND", message: "Reserva no encontrada" });
    if (booking.status !== "CHECKED_IN") {
      booking = {
        ...booking,
        status: "CHECKED_IN",
        passengers: booking.passengers.map((passenger) => ({
          ...passenger,
          seatNumber: "1A",
          checkedInAt: new Date().toISOString(),
        })),
      };
      events.push({
        id: "audit-1",
        actor: request.authUser!.username,
        action: "CHECK_IN",
        entityType: "Reservation",
        entityId: booking.id,
        details: { code: booking.code },
        createdAt: new Date().toISOString(),
      });
    }
    return {
      reservationCode: booking.code,
      status: "CHECKED_IN",
      seats: booking.passengers.map((passenger) => ({
        passengerId: passenger.id,
        seatNumber: passenger.seatNumber,
      })),
    };
  },
);
api.get(internalRoutes.audit, guard(["viewer"]), async () => events);
await api.listen({ host: "127.0.0.1", port: 18080 });
async function shutdown() {
  await api.close();
  await auth.close();
}
process.once("SIGTERM", () => {
  void shutdown();
});
process.once("SIGINT", () => {
  void shutdown();
});
