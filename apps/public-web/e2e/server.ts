// Fixture exclusiva de Playwright: no es la API de negocio ni se incluye en el bundle.
import Fastify from "fastify";
import {
  cancelReservationRequestSchema,
  createReservationRequestSchema,
  flightSearchQuerySchema,
  reservationLookupQuerySchema,
  type CreateReservationRequest,
  type PublicReservation,
} from "@aeroquetzal/api-contracts";
import { airports, flight } from "../test/fixtures";

if (process.env.NODE_ENV !== "test")
  throw new Error("La fixture pública sólo puede ejecutarse con NODE_ENV=test");
const app = Fastify({ logger: false });
let reserved = 0;
let nextCode = 0;
const reservations = new Map<
  string,
  { summary: PublicReservation; request: CreateReservationRequest }
>();
const missing = { code: "NOT_FOUND", message: "No se encontró el registro" };
app.get("/health", async () => ({ status: "test-fixture" }));
app.post("/__test/reset", async () => {
  reserved = 0;
  nextCode = 0;
  reservations.clear();
  return { ok: true };
});
app.post<{ Params: { code: string } }>(
  "/__test/check-in/:code",
  async (request, reply) => {
    const item = reservations.get(request.params.code);
    if (!item) return reply.code(404).send(missing);
    item.summary.status = "CHECKED_IN";
    return { ok: true };
  },
);
app.get("/api/v1/public/airports", async () => airports);
app.get("/api/v1/public/flights", async (request, reply) => {
  const query = flightSearchQuerySchema.safeParse(request.query);
  if (!query.success)
    return reply
      .code(400)
      .send({ code: "INVALID_QUERY", message: "Búsqueda inválida" });
  return query.data.origin === "GUA" &&
    query.data.destination === "SAL" &&
    query.data.date === "2099-11-05"
    ? [{ ...flight, availableSeats: 2 - reserved }]
    : [];
});
app.get<{ Params: { id: string } }>(
  "/api/v1/public/flights/:id/availability",
  async (request, reply) => {
    if (request.params.id !== flight.id) return reply.code(404).send(missing);
    return {
      flightInstanceId: flight.id,
      capacity: 2,
      availableSeats: 2 - reserved,
    };
  },
);
app.post("/api/v1/public/reservations", async (request, reply) => {
  const parsed = createReservationRequestSchema.safeParse(request.body);
  if (!parsed.success)
    return reply
      .code(400)
      .send({ code: "INVALID_REQUEST", message: "Datos inválidos" });
  if (parsed.data.flightInstanceId !== flight.id)
    return reply.code(404).send(missing);
  if (reserved + parsed.data.passengers.length > 2)
    return reply.code(409).send({ code: "SOLD_OUT", message: "Sin cupos" });
  const code = "AQ" + String(++nextCode).padStart(5, "0");
  reserved += parsed.data.passengers.length;
  reservations.set(code, {
    summary: {
      code,
      status: "CONFIRMED",
      flightNumber: flight.flightNumber,
      origin: "GUA",
      destination: "SAL",
      departureAt: flight.departureAt,
      passengerCount: parsed.data.passengers.length,
    },
    request: parsed.data,
  });
  return reply
    .code(201)
    .send({
      code,
      status: "CONFIRMED",
      message: "Reserva gratuita confirmada",
    });
});
app.get<{ Params: { code: string } }>(
  "/api/v1/public/reservations/:code",
  async (request, reply) => {
    const query = reservationLookupQuerySchema.safeParse(request.query);
    const item = reservations.get(request.params.code);
    if (
      !query.success ||
      !item ||
      !item.request.passengers.some(
        (person) => person.documentNumber === query.data.documentNumber,
      )
    )
      return reply.code(404).send(missing);
    return item.summary;
  },
);
app.post<{ Params: { code: string } }>(
  "/api/v1/public/reservations/:code/cancel",
  async (request, reply) => {
    const parsed = cancelReservationRequestSchema.safeParse(request.body);
    const item = reservations.get(request.params.code);
    if (
      !parsed.success ||
      !item ||
      !item.request.passengers.some(
        (person) => person.documentNumber === parsed.data.documentNumber,
      )
    )
      return reply.code(404).send(missing);
    if (item.summary.status !== "CONFIRMED")
      return reply
        .code(409)
        .send({ code: "INVALID_STATUS", message: "No se puede cancelar" });
    item.summary.status = "CANCELLED";
    reserved -= item.summary.passengerCount;
    return {
      code: item.summary.code,
      status: "CANCELLED",
      restoredSeats: item.summary.passengerCount,
    };
  },
);
app.get<{ Params: { number: string } }>(
  "/api/v1/public/status/:number",
  async (request, reply) => {
    if (request.params.number !== flight.flightNumber)
      return reply.code(404).send(missing);
    return {
      flightNumber: flight.flightNumber,
      status: flight.status,
      departureAt: flight.departureAt,
      updatedAt: "2026-10-29T15:00:00Z",
    };
  },
);
await app.listen({ host: "127.0.0.1", port: 18082 });
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    void app.close();
  });
