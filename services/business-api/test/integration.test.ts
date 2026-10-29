import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "@aeroquetzal/database";
import { buildAuthServer, MockDirectory, readConfig } from "@aeroquetzal/auth-service";
import { publicReservationSchema, internalFlightInstanceSchema, checkInResponseSchema } from "@aeroquetzal/api-contracts";
import { readBusinessConfig } from "../src/config.js";
import { buildBusinessServer } from "../src/server.js";
import { BusinessService } from "../src/service.js";

const connection = process.env.TEST_DATABASE_URL;
if (connection && !new URL(connection).pathname.endsWith("_test")) throw new Error("TEST_DATABASE_URL debe usar una base terminada en _test");
describe.skipIf(!connection)("API con PostgreSQL real y Auth de Hugo", () => {
  const db = createPrismaClient(connection ?? "postgresql://localhost/aeroquetzal_nery_test");
  const origin = "http://127.0.0.1:5174";
  const gateway = { "x-aq-gateway-token": "integration-only-gateway-token-32-characters" };
  let api: Awaited<ReturnType<typeof buildBusinessServer>>;
  let auth: Awaited<ReturnType<typeof buildAuthServer>>;
  let instanceId: string;
  let flightId: string;
  let aircraftId: string;
  const input = (document = "P1234567") => ({
    flightInstanceId: instanceId, contactEmail: "ana@example.com",
    passengers: [{ firstName: "Ana", lastName: "López", documentNumber: document }],
  });
  async function login(username = "admin") {
    const response = await auth.inject({ method: "POST", url: "/api/v1/auth/login", headers: { origin }, payload: { username, password: "test-only-password" } });
    expect(response.statusCode).toBe(200);
    return { cookie: String(response.headers["set-cookie"]).split(";")[0]!, origin, "x-csrf-token": response.json().csrfToken };
  }
  async function reserve(document = "P1234567") {
    const result = await api.inject({ method: "POST", url: "/api/v1/public/reservations", headers: gateway, payload: input(document) });
    expect(result.statusCode, result.body).toBe(201);
    return result.json().code as string;
  }
  beforeAll(async () => {
    auth = await buildAuthServer({ config: readConfig({ NODE_ENV: "test", AUTH_ORIGIN: origin, SESSION_SECRET: "integration-only-session-secret-48-characters" }),
      directory: new MockDirectory({
        admin: { password: "test-only-password", displayName: "TI", groups: ["ti"] },
        operator: { password: "test-only-password", displayName: "Operador", groups: ["operadores"] },
        checkin: { password: "test-only-password", displayName: "Agente", groups: ["checkin"] },
        viewer: { password: "test-only-password", displayName: "Monitor", groups: ["monitoreo"] },
      }) });
    const authFetch: typeof fetch = async (url, options) => {
      const response = await auth.inject({ url: new URL(String(url)).pathname, headers: Object.fromEntries(new Headers(options?.headers)) });
      const headers = new Headers({ "content-type": "application/json" });
      const cookies = response.headers["set-cookie"];
      for (const cookie of Array.isArray(cookies) ? cookies : cookies ? [cookies] : []) headers.append("set-cookie", cookie);
      return new Response(response.body, { status: response.statusCode, headers });
    };
    api = await buildBusinessServer({ db, authFetch, rateMax: 10000,
      config: readBusinessConfig({ NODE_ENV: "test", AUTH_ORIGIN: origin, PUBLIC_GATEWAY_TOKEN: gateway["x-aq-gateway-token"] }) });
  });
  beforeEach(async () => {
    await db.$executeRawUnsafe('TRUNCATE "airports", "aircraft", "passengers", "audit_events" CASCADE');
    const origin = await db.airport.create({ data: { code: "GUA", name: "La Aurora", city: "Guatemala", country: "Guatemala", timezone: "America/Guatemala" } });
    const destination = await db.airport.create({ data: { code: "SAL", name: "El Salvador", city: "San Salvador", country: "El Salvador", timezone: "America/El_Salvador" } });
    const aircraft = await db.aircraft.create({ data: { registration: "TG-TEST", model: "ATR 72", capacity: 72 } });
    const flight = await db.flight.create({ data: { flightNumber: "AQ118", originId: origin.id, destinationId: destination.id, durationMinutes: 50 } });
    const instance = await db.flightInstance.create({ data: { flightId: flight.id, aircraftId: aircraft.id, departureAt: new Date("2099-11-05T13:00:00Z"), arrivalAt: new Date("2099-11-05T13:50:00Z"), capacity: 4 } });
    instanceId = instance.id; flightId = flight.id; aircraftId = aircraft.id;
  });
  afterAll(async () => { await api?.close(); await auth?.close(); await db.$disconnect(); });

  it("health comprueba PostgreSQL y todos los catálogos públicos cumplen el contrato", async () => {
    expect((await api.inject("/health")).json()).toEqual({ status: "ok" });
    for (const url of ["/airports", "/flights?origin=GUA&destination=SAL&date=2099-11-05", `/flights/${instanceId}/availability`, "/status/AQ118"]) {
      const result = await api.inject({ url: "/api/v1/public" + url, headers: gateway });
      expect(result.statusCode, result.body).toBe(200);
      expect(result.headers["cache-control"]).toBe("no-store");
    }
    const search = await api.inject({ url: "/api/v1/public/flights?origin=GUA&destination=SAL&date=2099-11-05", headers: gateway });
    expect(search.json()[0]).toMatchObject({ id: instanceId, availableSeats: 4 });
    expect(search.body).not.toMatch(/registration|contactEmail|documentNumber/);
    expect((await api.inject({ url: "/api/v1/public/flights?origin=GUA&destination=GUA&date=bad", headers: gateway })).statusCode).toBe(400);
  });
  it("reserva, verifica documento y cancela devolviendo cupos exactamente una vez", async () => {
    const code = await reserve();
    const good = await api.inject({ url: `/api/v1/public/reservations/${code}?documentNumber=P1234567`, headers: gateway });
    expect(publicReservationSchema.parse(good.json())).toMatchObject({ code, status: "CONFIRMED", passengerCount: 1 });
    expect(good.body).not.toMatch(/Ana|López|contactEmail|P1234567/);
    expect((await api.inject({ url: `/api/v1/public/reservations/${code}?documentNumber=WRONG123`, headers: gateway })).statusCode).toBe(404);
    const cancellations = await Promise.all([1, 2].map(() => api.inject({ method: "POST", url: `/api/v1/public/reservations/${code}/cancel`, headers: gateway, payload: { documentNumber: "P1234567" } })));
    expect(cancellations.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect((await db.flightInstance.findUniqueOrThrow({ where: { id: instanceId } })).reservedSeats).toBe(0);
  });
  it("serializa reservas concurrentes sin sobreventa y conserva todo o nada", async () => {
    const attempts = await Promise.all(Array.from({ length: 8 }, (_, i) => api.inject({ method: "POST", url: "/api/v1/public/reservations", headers: gateway, payload: input(`P00000${i}`) })));
    expect(attempts.filter((r) => r.statusCode === 201)).toHaveLength(4);
    expect(attempts.filter((r) => r.statusCode === 409)).toHaveLength(4);
    expect(await db.reservation.count()).toBe(4);
    expect(await db.passenger.count()).toBe(4);
    expect((await db.flightInstance.findUniqueOrThrow({ where: { id: instanceId } })).reservedSeats).toBe(4);
  });
  it("rollback conserva el inventario cuando falla una escritura de auditoría", async () => {
    await db.$executeRawUnsafe(`CREATE FUNCTION reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER reject_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_audit()`);
    try {
      const response = await api.inject({ method: "POST", url: "/api/v1/public/reservations", headers: gateway, payload: input() });
      expect(response.statusCode).toBe(500);
      expect(response.body).not.toContain("test failure");
      expect(await db.reservation.count()).toBe(0);
      expect(await db.passenger.count()).toBe(0);
      expect((await db.flightInstance.findUniqueOrThrow({ where: { id: instanceId } })).reservedSeats).toBe(0);
    } finally { await db.$executeRawUnsafe("DROP TRIGGER reject_audit ON audit_events"); await db.$executeRawUnsafe("DROP FUNCTION reject_audit()"); }
  });
  it("recupera una colisión de código sin perder datos ni cupos", async () => {
    const code = await reserve(); let calls = 0;
    const service = new BusinessService(db, undefined, () => calls++ === 0 ? code : "AQZZ999");
    expect((await service.reserve(input("P7654321"))).code).toBe("AQZZ999");
    expect(await db.reservation.count()).toBe(2);
  });
  it("rechaza pasajeros duplicados, datos contradictorios y vuelos no reservables", async () => {
    const body = input(); body.passengers.push(body.passengers[0]!);
    expect((await api.inject({ method: "POST", url: "/api/v1/public/reservations", headers: gateway, payload: body })).statusCode).toBe(400);
    await reserve();
    expect((await api.inject({ method: "POST", url: "/api/v1/public/reservations", headers: gateway, payload: input() })).statusCode).toBe(409);
    await db.flightInstance.update({ where: { id: instanceId }, data: { status: "CANCELLED" } });
    expect((await api.inject({ method: "POST", url: "/api/v1/public/reservations", headers: gateway, payload: input("P9999999") })).statusCode).toBe(409);
    expect((await api.inject({ url: `/api/v1/public/flights/${instanceId}/availability`, headers: gateway })).json().availableSeats).toBe(0);
  });
  it("check-in concurrente es idempotente, asigna primeros asientos y registra al actor", async () => {
    const codes = await Promise.all(["P1234567", "P7654321"].map(reserve));
    const headers = await login("checkin");
    const responses = await Promise.all([codes[0], codes[0], codes[1]].map((code) => api.inject({ method: "POST", url: `/api/v1/internal/reservations/${code}/check-in`, headers, payload: {} })));
    for (const response of responses) { expect(response.statusCode, response.body).toBe(200); checkInResponseSchema.parse(response.json()); }
    expect(responses[0]!.json()).toEqual(responses[1]!.json());
    expect((await db.seatAssignment.findMany()).map((s) => s.seatNumber).sort()).toEqual(["1A", "1B"]);
    expect(await db.checkIn.count()).toBe(2);
    expect(await db.auditEvent.count({ where: { action: "CHECK_IN", actor: "checkin" } })).toBe(2);
    expect((await api.inject({ method: "POST", url: `/api/v1/public/reservations/${codes[0]}/cancel`, headers: gateway, payload: { documentNumber: "P1234567" } })).statusCode).toBe(409);
  });
  it("valida todos los pasajeros antes de completar un Check-In grupal", async () => {
    const body = input(); body.passengers.push({ firstName: "Luis", lastName: "López", documentNumber: "P8765432" });
    const made = await api.inject({ method: "POST", url: "/api/v1/public/reservations", headers: gateway, payload: body });
    expect(made.statusCode).toBe(201);
    const code = made.json().code;
    const headers = await login("checkin");
    const detail = await api.inject({ url: `/api/v1/internal/reservations/${code}`, headers });
    const ids = detail.json().passengers.map((person: { id: string }) => person.id);
    for (const passengerIds of [[ids[0]], [...ids, ids[0]], ["unknown1", "unknown2"]]) {
      expect((await api.inject({ method: "POST", url: `/api/v1/internal/reservations/${code}/check-in`, headers, payload: { passengerIds } })).statusCode).toBe(400);
      expect(await db.checkIn.count()).toBe(0);
    }
    const checked = await api.inject({ method: "POST", url: `/api/v1/internal/reservations/${code}/check-in`, headers, payload: { passengerIds: ids } });
    expect(checked.statusCode).toBe(200);
    expect(checked.json().seats.map((seat: { seatNumber: string }) => seat.seatNumber).sort()).toEqual(["1A", "1B"]);
  });
  it("carrera entre cancelación y Check-In conserva un único resultado consistente", async () => {
    const code = await reserve(); const headers = await login("checkin");
    const results = await Promise.all([
      api.inject({ method: "POST", url: `/api/v1/public/reservations/${code}/cancel`, headers: gateway, payload: { documentNumber: "P1234567" } }),
      api.inject({ method: "POST", url: `/api/v1/internal/reservations/${code}/check-in`, headers, payload: {} }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const booking = await db.reservation.findUniqueOrThrow({ where: { code } });
    expect(await db.checkIn.count()).toBe(booking.status === "CHECKED_IN" ? 1 : 0);
    expect((await db.flightInstance.findUniqueOrThrow({ where: { id: instanceId } })).reservedSeats).toBe(booking.status === "CHECKED_IN" ? 1 : 0);
  });
  it("CRUD de vuelos y horarios valida capacidad, solapamientos y transiciones", async () => {
    const headers = await login();
    const created = await api.inject({ method: "POST", url: "/api/v1/internal/flights", headers, payload: { flightNumber: "AQ205", origin: "GUA", destination: "SAL", durationMinutes: 60 } });
    expect(created.statusCode, created.body).toBe(201);
    const id = created.json().id;
    const edited = await api.inject({ method: "PATCH", url: `/api/v1/internal/flights/${id}`, headers, payload: { durationMinutes: 70, active: false } });
    expect(edited.json()).toMatchObject({ durationMinutes: 70, active: false });
    const schedule = { flightId, aircraftId, departureAt: "2099-11-06T13:00:00Z", arrivalAt: "2099-11-06T14:00:00Z", capacity: 72 };
    const made = await api.inject({ method: "POST", url: "/api/v1/internal/flight-instances", headers, payload: schedule });
    expect(made.statusCode, made.body).toBe(201); internalFlightInstanceSchema.parse(made.json());
    expect((await api.inject({ method: "POST", url: "/api/v1/internal/flight-instances", headers, payload: schedule })).statusCode).toBe(409);
    for (const [status, expected] of [["ARRIVED", 409], ["BOARDING", 200], ["DEPARTED", 200], ["ARRIVED", 200]] as const) {
      expect((await api.inject({ method: "PATCH", url: `/api/v1/internal/flight-instances/${made.json().id}/status`, headers, payload: { status } })).statusCode).toBe(expected);
    }
    for (const url of ["airports", "aircraft", "flights", "flight-instances", "dashboard", "audit"]) {
      expect((await api.inject({ url: "/api/v1/internal/" + url, headers })).statusCode).toBe(200);
    }
    const code = await reserve();
    expect((await api.inject({ url: "/api/v1/internal/reservations?q=Ana", headers })).json()[0].code).toBe(code);
    expect((await api.inject({ url: `/api/v1/internal/reservations/${code}`, headers })).json().passengers[0].documentNumber).toBe("P1234567");
  });
  it("rechaza anónimos, CSRF inválido, roles insuficientes y gateway falso", async () => {
    expect((await api.inject("/api/v1/internal/flights")).statusCode).toBe(401);
    expect((await api.inject("/api/v1/public/airports")).statusCode).toBe(403);
    expect((await api.inject({ url: "/api/v1/public/airports", headers: { "x-aq-gateway-token": "forged" } })).statusCode).toBe(403);
    const headers = await login("viewer");
    expect((await api.inject({ url: "/api/v1/internal/flights", headers: { ...headers, "x-role": "admin" } })).statusCode).toBe(403);
    expect((await api.inject({ url: "/api/v1/internal/audit", headers })).statusCode).toBe(200);
    const admin = await login(); delete (admin as Partial<typeof admin>)["x-csrf-token"];
    expect((await api.inject({ method: "POST", url: "/api/v1/internal/flights", headers: admin, payload: {} })).statusCode).toBe(403);
    expect((await api.inject({ method: "POST", url: "/api/v1/public/reservations", remoteAddress: "192.0.2.254", headers: { ...gateway, "content-type": "application/json" }, payload: JSON.stringify({ value: "x".repeat(17000) }) })).statusCode).toBe(413);
  });
});
