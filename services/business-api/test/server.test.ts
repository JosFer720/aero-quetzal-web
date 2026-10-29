import { describe, expect, it } from "vitest";
import type { DatabaseClient } from "@aeroquetzal/database";
import { readBusinessConfig } from "../src/config.js";
import { buildBusinessServer } from "../src/server.js";

describe("controles HTTP independientes de PostgreSQL", () => {
  it("limita intentos y mantiene health disponible para supervisión", async () => {
    const db = { airport: { findMany: async () => [] }, $queryRaw: async () => [{ result: 1 }] } as unknown as DatabaseClient;
    const app = await buildBusinessServer({ config: readBusinessConfig({ NODE_ENV: "test" }), db, rateMax: 2 });
    try {
      expect((await app.inject("/api/v1/public/airports")).statusCode).toBe(200);
      expect((await app.inject("/api/v1/public/airports")).statusCode).toBe(200);
      const blocked = await app.inject("/api/v1/public/airports");
      expect(blocked.statusCode).toBe(429);
      expect(blocked.headers["retry-after"]).toBeDefined();
      expect(blocked.json().code).toBe("RATE_LIMITED");
      expect((await app.inject("/health")).statusCode).toBe(200);
    } finally { await app.close(); }
  });
  it("health falla si la base no responde sin publicar detalles internos", async () => {
    const db = { $queryRaw: async () => { throw new Error("sensitive-database-password"); } } as unknown as DatabaseClient;
    const app = await buildBusinessServer({ config: readBusinessConfig({ NODE_ENV: "test" }), db });
    try {
      const response = await app.inject("/health");
      expect(response.statusCode).toBe(503);
      expect(response.body).not.toContain("sensitive");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
    } finally { await app.close(); }
  });
});
