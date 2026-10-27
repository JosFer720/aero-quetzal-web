import { authRoutes, sessionResponseSchema } from "@aeroquetzal/api-contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DirectoryUnavailableError } from "../src/ldap.js";
import { buildAuthServer } from "../src/server.js";
import { cookieFrom, testConfig, testDirectory } from "./helpers.js";

const apps: Awaited<ReturnType<typeof buildAuthServer>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

async function server(overrides: Parameters<typeof buildAuthServer>[0] = { config: testConfig() }) {
  const app = await buildAuthServer({ directory: testDirectory(), ...overrides });
  apps.push(app);
  return app;
}

async function login(app: Awaited<ReturnType<typeof server>>, options: {
  username?: string;
  password?: string;
  origin?: string;
  cookie?: string;
} = {}) {
  return app.inject({
    method: "POST",
    url: authRoutes.login,
    headers: {
      origin: options.origin ?? "http://localhost:5174",
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    payload: { username: options.username ?? "hugo", password: options.password ?? "test-password" },
  });
}

describe("autenticación y sesiones", () => {
  it("inicia sesión y devuelve sólo el contrato público de usuario", async () => {
    const now = Date.now();
    const app = await server({ config: testConfig(), now: () => now });
    const response = await login(app);
    expect(response.statusCode).toBe(200);
    const session = sessionResponseSchema.parse(response.json());
    expect(session.user).toEqual({ username: "hugo", displayName: "Hugo", roles: ["admin"] });
    expect(session.csrfToken).toHaveLength(43);
    expect(response.body).not.toContain("test-password");
    const current = await app.inject({ url: authRoutes.session, headers: { cookie: cookieFrom(response) } });
    expect(current.json()).toEqual(session);
  });

  it.each(["wrong-password", ""])("rechaza credenciales inválidas sin emitir cookie: %s", async (password) => {
    const app = await server();
    const response = await login(app, { password });
    expect(response.statusCode).toBe(password ? 401 : 400);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("no distingue un usuario inexistente de uno sin grupo autorizado", async () => {
    const app = await server();
    const missing = await login(app, { username: "missing" });
    const outsider = await login(app, { username: "outsider" });
    expect(missing.statusCode).toBe(401);
    expect(outsider.body).toBe(missing.body);
  });

  it("falla cerrado cuando LDAP no está disponible", async () => {
    const app = await server({
      config: testConfig(),
      directory: { authenticate: vi.fn().mockRejectedValue(new DirectoryUnavailableError()) },
    });
    const response = await login(app);
    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe("DIRECTORY_UNAVAILABLE");
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("rechaza el login sin origen o desde otro sitio antes de consultar LDAP", async () => {
    const authenticate = vi.fn();
    const app = await server({ config: testConfig(), directory: { authenticate } });
    const missing = await app.inject({
      method: "POST", url: authRoutes.login, payload: { username: "hugo", password: "test-password" },
    });
    const foreign = await login(app, { origin: "https://attacker.example" });
    expect(missing.statusCode).toBe(403);
    expect(foreign.statusCode).toBe(403);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("emite cookies seguras y encabezados de seguridad en producción", async () => {
    const app = await server({
      config: testConfig({ NODE_ENV: "production", AUTH_ORIGIN: "https://intranet.example" }),
    });
    const response = await login(app, { origin: "https://intranet.example" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["set-cookie"]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]).toContain("Secure");
    expect(response.headers["set-cookie"]).toContain("SameSite=Strict");
    expect(response.headers["set-cookie"]).toContain("Path=/api/v1");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["strict-transport-security"]).toBeDefined();
    expect(response.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("no autentica cookies alteradas o no existentes", async () => {
    const app = await server();
    for (const cookie of ["aq_session=forged", "other=value"]) {
      const response = await app.inject({ url: authRoutes.session, headers: { cookie } });
      expect(response.json()).toEqual({
        authenticated: false, user: null, csrfToken: null, expiresAt: null,
      });
    }
  });

  it("reemplaza la sesión anterior al volver a iniciar sesión", async () => {
    const app = await server();
    const first = await login(app);
    const second = await login(app, { cookie: cookieFrom(first) });
    expect(cookieFrom(second)).not.toBe(cookieFrom(first));
    const old = await app.inject({ url: authRoutes.session, headers: { cookie: cookieFrom(first) } });
    expect(old.json().authenticated).toBe(false);
  });

  it("rota el identificador y mantiene el token CSRF dentro de la misma sesión", async () => {
    let now = Date.now();
    const app = await server({ config: testConfig(), now: () => now });
    const first = await login(app);
    now += 900000;
    const rotated = await app.inject({ url: authRoutes.session, headers: { cookie: cookieFrom(first) } });
    expect(rotated.json().authenticated).toBe(true);
    expect(rotated.json().csrfToken).toBe(first.json().csrfToken);
    expect(cookieFrom(rotated)).not.toBe(cookieFrom(first));
    const concurrent = await app.inject({ url: authRoutes.session, headers: { cookie: cookieFrom(first) } });
    expect(concurrent.json().authenticated).toBe(true);
    expect(cookieFrom(concurrent)).toBe(cookieFrom(rotated));
    now += 30000;
    const replay = await app.inject({ url: authRoutes.session, headers: { cookie: cookieFrom(first) } });
    expect(replay.json().authenticated).toBe(false);
  });

  it("logout durante la rotación invalida los identificadores nuevo y anterior", async () => {
    let now = Date.now();
    const app = await server({ config: testConfig(), now: () => now });
    const first = await login(app);
    now += 900000;
    const rotated = await app.inject({ url: authRoutes.session, headers: { cookie: cookieFrom(first) } });
    const logout = await app.inject({
      method: "POST", url: authRoutes.logout,
      headers: {
        cookie: cookieFrom(first), origin: "http://localhost:5174",
        "x-csrf-token": first.json().csrfToken,
      },
    });
    expect(logout.statusCode).toBe(204);
    for (const cookie of [cookieFrom(first), cookieFrom(rotated)]) {
      const response = await app.inject({ url: authRoutes.session, headers: { cookie } });
      expect(response.json().authenticated).toBe(false);
    }
  });

  it("expira por inactividad y limpia la cookie", async () => {
    let now = Date.now();
    const app = await server({ config: testConfig(), now: () => now });
    const first = await login(app);
    now += 1800000;
    const response = await app.inject({ url: authRoutes.session, headers: { cookie: cookieFrom(first) } });
    expect(response.json().authenticated).toBe(false);
    expect(response.headers["set-cookie"]).toContain("Max-Age=0");
  });

  it("expira al alcanzar la duración máxima aunque haya actividad", async () => {
    let now = Date.now();
    const app = await server({
      config: testConfig({ SESSION_IDLE_SECONDS: 30, SESSION_MAX_SECONDS: 60, SESSION_ROTATION_SECONDS: 10 }),
      now: () => now,
    });
    let cookie = cookieFrom(await login(app));
    for (let index = 0; index < 3; index++) {
      now += 20000;
      const response = await app.inject({ url: authRoutes.session, headers: { cookie } });
      expect(response.json().authenticated).toBe(index < 2);
      cookie = cookieFrom(response);
    }
  });

  it("exige CSRF y origen válido para logout e invalida la sesión en el servidor", async () => {
    const app = await server();
    const first = await login(app);
    const cookie = cookieFrom(first);
    for (const headers of [
      { cookie, origin: "http://localhost:5174" },
      { cookie, origin: "http://localhost:5174", "x-csrf-token": "forged" },
      { cookie, origin: "https://attacker.example", "x-csrf-token": first.json().csrfToken },
    ]) {
      const rejected = await app.inject({ method: "POST", url: authRoutes.logout, headers });
      expect(rejected.statusCode).toBe(403);
    }
    const response = await app.inject({
      method: "POST", url: authRoutes.logout,
      headers: { cookie, origin: "http://localhost:5174", "x-csrf-token": first.json().csrfToken },
    });
    expect(response.statusCode).toBe(204);
    const replay = await app.inject({ url: authRoutes.session, headers: { cookie } });
    expect(replay.json().authenticated).toBe(false);
    const anonymous = await app.inject({
      method: "POST", url: authRoutes.logout, headers: { origin: "http://localhost:5174" },
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it("bloquea intentos por usuario incluso desde IP distintas y permite reintentar después", async () => {
    let now = Date.now();
    const app = await server({ config: testConfig(), now: () => now });
    for (let index = 0; index < 5; index++) {
      const response = await app.inject({
        method: "POST", url: authRoutes.login, remoteAddress: `192.0.2.${index + 1}`,
        headers: { origin: "http://localhost:5174" },
        payload: { username: index % 2 ? "HUGO" : "hugo", password: "invalid" },
      });
      expect(response.statusCode).toBe(401);
    }
    const blocked = await login(app);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("900");
    now += 900000;
    expect((await login(app)).statusCode).toBe(200);
  });

  it("limita una IP que prueba muchos usuarios y no confía en X-Forwarded-For", async () => {
    const app = await server();
    for (let index = 0; index < 20; index++) {
      expect((await login(app, { username: `unknown-${index}` })).statusCode).toBe(401);
    }
    const blocked = await app.inject({
      method: "POST", url: authRoutes.login,
      headers: { origin: "http://localhost:5174", "x-forwarded-for": "192.0.2.99" },
      payload: { username: "hugo", password: "test-password" },
    });
    expect(blocked.statusCode).toBe(429);
  });

  it("limita el tamaño del cuerpo y oculta errores inesperados", async () => {
    const app = await server({
      config: testConfig(),
      directory: { authenticate: vi.fn().mockRejectedValue(new Error("sensitive-directory-details")) },
    });
    const failure = await login(app);
    expect(failure.statusCode).toBe(500);
    expect(failure.body).not.toContain("sensitive-directory-details");
    const large = await login(app, { password: "x".repeat(5000) });
    expect(large.statusCode).toBe(413);
    const health = await app.inject("/health");
    expect(health.json()).toEqual({ status: "ok" });
  });
});
