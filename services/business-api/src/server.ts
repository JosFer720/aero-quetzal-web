import { timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { createAuthGuard } from "@aeroquetzal/auth-service";
import { DomainRuleError, type AppRole } from "@aeroquetzal/domain";
import { Prisma, type DatabaseClient } from "@aeroquetzal/database";
import {
  flightSearchQuerySchema, idSchema, createReservationRequestSchema, reservationCodeSchema,
  reservationLookupQuerySchema, cancelReservationRequestSchema, flightNumberSchema,
  createFlightRequestSchema, updateFlightRequestSchema, createFlightInstanceRequestSchema,
  updateFlightStatusRequestSchema, internalReservationSearchSchema, checkInRequestSchema,
} from "@aeroquetzal/api-contracts";
import type { BusinessConfig } from "./config.js";
import { BusinessError } from "./errors.js";
import { BusinessService } from "./service.js";

export async function buildBusinessServer(options: {
  config: BusinessConfig;
  db: DatabaseClient;
  authFetch?: typeof fetch;
  now?: () => Date;
  rateMax?: number;
}) {
  const { config, db } = options;
  const proxies = config.TRUSTED_PROXIES.split(",").map((ip) => ip.trim()).filter(Boolean);
  const app = Fastify({ bodyLimit: 16384, logger: false, trustProxy: proxies.length ? proxies : false });
  const service = new BusinessService(db, options.now);
  await app.register(helmet, { contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } } });
  await app.register(rateLimit, { max: options.rateMax ?? 120, timeWindow: "1 minute" });
  app.decorateRequest("authUser", null);
  app.addHook("onRequest", async (_request, reply) => { reply.header("Cache-Control", "no-store"); });
  app.setErrorHandler<{ statusCode?: number }>((error, _request, reply) => {
    if (error instanceof BusinessError) return reply.code(error.status).send({ code: error.code, message: error.message });
    if (error instanceof z.ZodError) return reply.code(400).send({ code: "INVALID_REQUEST", message: "Revisa los datos ingresados" });
    if (error instanceof DomainRuleError) return reply.code(409).send({ code: "CONFLICT", message: error.message });
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (["P2002", "P2003", "P2004", "P2034"].includes(error.code)) return reply.code(409).send({ code: "CONFLICT", message: "El registro o la disponibilidad cambió" });
      if (error.code === "P2025") return reply.code(404).send({ code: "NOT_FOUND", message: "Registro no encontrado" });
    }
    const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    return reply.code(status).send({ code: status === 429 ? "RATE_LIMITED" : status === 500 ? "INTERNAL_ERROR" : "INVALID_REQUEST",
      message: status === 429 ? "Demasiados intentos. Intenta más tarde" : "No se pudo completar la operación" });
  });
  app.get("/health", { config: { rateLimit: false } }, async (_request, reply) => {
    try { await db.$queryRaw`SELECT 1`; return { status: "ok" }; }
    catch { return reply.code(503).send({ status: "unavailable" }); }
  });
  await app.register(async (publicApi) => {
    publicApi.addHook("onRequest", async (request, reply) => {
      if (!config.PUBLIC_GATEWAY_TOKEN && config.NODE_ENV !== "production") return;
      const token = request.headers["x-aq-gateway-token"];
      const expected = Buffer.from(config.PUBLIC_GATEWAY_TOKEN);
      const received = Buffer.from(typeof token === "string" ? token : "");
      if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
        return reply.code(403).send({ code: "FORBIDDEN", message: "Gateway no autorizado" });
      }
    });
    publicApi.get("/airports", () => service.airports());
    publicApi.get("/flights", (request) => service.search(flightSearchQuerySchema.parse(request.query)));
    publicApi.get("/flights/:id/availability", (request) => service.availability(z.object({ id: idSchema }).parse(request.params).id));
    publicApi.post("/reservations", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
      const response = await service.reserve(createReservationRequestSchema.parse(request.body));
      return reply.code(201).send(response);
    });
    publicApi.get("/reservations/:code", (request) => service.lookup(
      z.object({ code: reservationCodeSchema }).parse(request.params).code,
      reservationLookupQuerySchema.parse(request.query).documentNumber,
    ));
    publicApi.post("/reservations/:code/cancel", (request) => service.cancel(
      z.object({ code: reservationCodeSchema }).parse(request.params).code,
      cancelReservationRequestSchema.parse(request.body).documentNumber,
    ));
    publicApi.get("/status/:flightNumber", (request) => service.status(z.object({ flightNumber: flightNumberSchema }).parse(request.params).flightNumber));
  }, { prefix: "/api/v1/public" });
  await app.register(async (internal) => {
    const guard = (roles: AppRole[]) => ({ onRequest: createAuthGuard({
      authUrl: config.AUTH_URL, origin: config.AUTH_ORIGIN, roles,
      ...(options.authFetch ? { fetch: options.authFetch } : {}),
    }) });
    const actor = (request: { authUser: { username: string } | null }) => request.authUser!.username;
    const id = (params: unknown) => z.object({ id: idSchema }).parse(params).id;
    const code = (params: unknown) => z.object({ code: reservationCodeSchema }).parse(params).code;
    internal.get("/airports", guard(["operator"]), () => service.internalAirports());
    internal.get("/aircraft", guard(["operator"]), () => service.aircraft());
    internal.get("/flights", guard(["operator"]), () => service.flights());
    internal.post("/flights", guard(["operator"]), async (request, reply) => reply.code(201).send(await service.saveFlight(actor(request), createFlightRequestSchema.parse(request.body))));
    internal.patch("/flights/:id", guard(["operator"]), (request) => service.saveFlight(actor(request), updateFlightRequestSchema.parse(request.body), id(request.params)));
    internal.get("/flight-instances", guard(["operator"]), () => service.instances());
    internal.post("/flight-instances", guard(["operator"]), async (request, reply) => reply.code(201).send(await service.createInstance(actor(request), createFlightInstanceRequestSchema.parse(request.body))));
    internal.patch("/flight-instances/:id/status", guard(["operator"]), (request) => service.updateStatus(actor(request), id(request.params), updateFlightStatusRequestSchema.parse(request.body)));
    internal.get("/reservations", guard(["operator", "checkin_agent"]), (request) => service.reservations(internalReservationSearchSchema.parse(request.query).q));
    internal.get("/reservations/:code", guard(["operator", "checkin_agent"]), (request) => service.internalReservation(code(request.params)));
    internal.post("/reservations/:code/check-in", guard(["checkin_agent"]), (request) => service.checkIn(actor(request), code(request.params), checkInRequestSchema.parse(request.body)));
    internal.get("/audit", guard(["viewer"]), () => service.auditEvents());
    internal.get("/dashboard", guard(["operator", "checkin_agent", "viewer"]), () => service.dashboard());
  }, { prefix: "/api/v1/internal" });
  return app;
}
