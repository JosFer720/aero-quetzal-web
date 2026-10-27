import Fastify from "fastify";
import { authRoutes } from "@aeroquetzal/api-contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAuthGuard } from "../src/guard.js";
import { buildAuthServer } from "../src/server.js";
import { cookieFrom, testConfig, testDirectory } from "./helpers.js";

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

async function setup(username = "hugo") {
  const auth = await buildAuthServer({ config: testConfig(), directory: testDirectory() });
  const api = Fastify();
  apps.push(auth, api);
  const localFetch = vi.fn<typeof fetch>(async (url, options) => {
    const response = await auth.inject({
      url: new URL(String(url)).pathname,
      headers: Object.fromEntries(new Headers(options?.headers)),
    });
    const headers = new Headers({ "content-type": "application/json" });
    const cookie = response.headers["set-cookie"];
    for (const value of Array.isArray(cookie) ? cookie : cookie ? [cookie] : []) {
      headers.append("set-cookie", value);
    }
    return new Response(response.body, { status: response.statusCode, headers });
  });
  const guard = (roles: Parameters<typeof createAuthGuard>[0]["roles"]) => createAuthGuard({
    authUrl: "http://auth:8081",
    origin: "http://localhost:5174",
    roles,
    fetch: localFetch,
  });
  api.decorateRequest("authUser", null);
  api.get("/flights", { onRequest: guard(["operator"]) }, async (request) => request.authUser);
  api.post("/check-in", { onRequest: guard(["checkin_agent"]) }, async (request) => request.authUser);
  api.get("/audit", { onRequest: guard(["viewer"]) }, async (request) => request.authUser);
  const login = await auth.inject({
    method: "POST", url: authRoutes.login,
    headers: { origin: "http://localhost:5174" },
    payload: { username, password: "test-password" },
  });
  return { api, auth, localFetch, cookie: cookieFrom(login), csrfToken: login.json().csrfToken };
}

describe("autorización consumida por business-api", () => {
  it("rechaza acceso anónimo sin llamar a Auth", async () => {
    const { api, localFetch } = await setup();
    expect((await api.inject("/flights")).statusCode).toBe(401);
    expect(localFetch).not.toHaveBeenCalled();
  });

  it.each([
    ["hugo", "/flights", 200],
    ["hugo", "/audit", 200],
    ["operator", "/flights", 200],
    ["operator", "/audit", 403],
    ["checkin", "/flights", 403],
    ["viewer", "/audit", 200],
    ["viewer", "/flights", 403],
  ])("aplica el rol de %s para %s", async (username, url, status) => {
    const { api, cookie } = await setup(username);
    const response = await api.inject({ url, headers: { cookie, "x-role": "admin" } });
    expect(response.statusCode).toBe(status);
    if (status === 200) expect(response.json().username).toBe(username);
  });

  it("requiere CSRF y origen válido para cambios, incluso con rol suficiente", async () => {
    const { api, cookie, csrfToken } = await setup("checkin");
    const missing = await api.inject({
      method: "POST", url: "/check-in", headers: { cookie, origin: "http://localhost:5174" },
    });
    expect(missing.statusCode).toBe(403);
    const foreign = await api.inject({
      method: "POST", url: "/check-in",
      headers: { cookie, origin: "https://attacker.example", "x-csrf-token": csrfToken },
    });
    expect(foreign.statusCode).toBe(403);
    const accepted = await api.inject({
      method: "POST", url: "/check-in",
      headers: { cookie, origin: "http://localhost:5174", "x-csrf-token": csrfToken },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.headers["set-cookie"]).toBeDefined();
  });

  it("rechaza un cambio con rol insuficiente aunque tenga CSRF válido", async () => {
    const { api, cookie, csrfToken } = await setup("operator");
    const response = await api.inject({
      method: "POST", url: "/check-in",
      headers: { cookie, origin: "http://localhost:5174", "x-csrf-token": csrfToken },
    });
    expect(response.statusCode).toBe(403);
  });

  it("rechaza cookies inválidas y sesiones invalidadas por logout", async () => {
    const { api, auth, cookie, csrfToken } = await setup();
    expect((await api.inject({ url: "/flights", headers: { cookie: "aq_session=forged" } })).statusCode).toBe(401);
    await auth.inject({
      method: "POST", url: authRoutes.logout,
      headers: { cookie, origin: "http://localhost:5174", "x-csrf-token": csrfToken },
    });
    expect((await api.inject({ url: "/flights", headers: { cookie } })).statusCode).toBe(401);
  });

  it("falla cerrado si Auth falla o devuelve datos inválidos, sin filtrar errores", async () => {
    const { api, cookie, localFetch } = await setup();
    for (const response of [
      new Response("upstream-sensitive-details", { status: 503 }),
      new Response("{}", { status: 200 }),
    ]) {
      localFetch.mockResolvedValueOnce(response);
      const result = await api.inject({ url: "/flights", headers: { cookie } });
      expect(result.statusCode).toBe(503);
      expect(result.body).not.toContain("upstream-sensitive-details");
    }
    localFetch.mockRejectedValueOnce(new Error("network-details"));
    expect((await api.inject({ url: "/flights", headers: { cookie } })).statusCode).toBe(503);
  });
});
