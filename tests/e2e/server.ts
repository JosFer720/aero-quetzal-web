// Runs the production business service against an explicitly isolated PostgreSQL database.
import { randomBytes } from "node:crypto";
import { createPrismaClient } from "@aeroquetzal/database";
import { buildAuthServer, MockDirectory, readConfig } from "@aeroquetzal/auth-service";
import { buildBusinessServer } from "../../services/business-api/src/server.js";
import { readBusinessConfig } from "../../services/business-api/src/config.js";

const url = process.env.TEST_DATABASE_URL;
if (process.env.NODE_ENV !== "test" || !url || !new URL(url).pathname.endsWith("_test")) {
  throw new Error("E2E requiere NODE_ENV=test y TEST_DATABASE_URL terminada en _test");
}
const db = createPrismaClient(url);
await db.$executeRawUnsafe('TRUNCATE "airports", "aircraft", "passengers", "audit_events" CASCADE');
const origin = await db.airport.create({ data: { code: "GUA", name: "La Aurora", city: "Guatemala", country: "Guatemala", timezone: "America/Guatemala" } });
const destination = await db.airport.create({ data: { code: "SAL", name: "El Salvador", city: "San Salvador", country: "El Salvador", timezone: "America/El_Salvador" } });
const aircraft = await db.aircraft.create({ data: { registration: "TG-E2E", model: "ATR 72", capacity: 72 } });
const flight = await db.flight.create({ data: { flightNumber: "AQ118", originId: origin.id, destinationId: destination.id, durationMinutes: 50 } });
await db.flightInstance.create({ data: { flightId: flight.id, aircraftId: aircraft.id, departureAt: new Date("2099-11-05T13:00:00Z"), arrivalAt: new Date("2099-11-05T13:50:00Z"), capacity: 3 } });
const auth = await buildAuthServer({ config: readConfig({ NODE_ENV: "test", AUTH_ORIGIN: "http://127.0.0.1:5174", SESSION_SECRET: randomBytes(48).toString("hex") }),
  directory: new MockDirectory({
    checkin: { password: "integrated-test-only", displayName: "Agente de pruebas", groups: ["checkin"] },
    admin: { password: "integrated-test-only", displayName: "TI de pruebas", groups: ["ti"] },
  }) });
await auth.listen({ host: "127.0.0.1", port: 18081 });
const api = await buildBusinessServer({ db, config: readBusinessConfig({ NODE_ENV: "test", AUTH_URL: "http://127.0.0.1:18081", AUTH_ORIGIN: "http://127.0.0.1:5174" }) });
await api.listen({ host: "127.0.0.1", port: 18080 });
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => { void api.close().then(() => auth.close()).then(() => db.$disconnect()); });
}
