import {
  authRoutes,
  loginRequestSchema,
  sessionUserSchema,
  type SessionResponse,
} from "@aeroquetzal/api-contracts";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

import type { AuthConfig } from "./config.js";
import { DirectoryUnavailableError, LdapDirectory, mapIdentity, type Directory } from "./ldap.js";
import { equalTokens, LoginLimiter, SessionStore } from "./sessions.js";

export const SESSION_COOKIE = "aq_session";

export async function buildAuthServer(options: {
  config: AuthConfig;
  directory?: Directory;
  now?: () => number;
}) {
  const { config } = options;
  if (config.AUTH_MODE === "mock" && !options.directory) {
    throw new Error("El modo mock requiere un directorio explícito, sin usuarios predeterminados");
  }
  const directory = options.directory ?? new LdapDirectory(config);
  const sessions = new SessionStore(
    config.SESSION_IDLE_SECONDS * 1000,
    config.SESSION_MAX_SECONDS * 1000,
    config.SESSION_ROTATION_SECONDS * 1000,
    options.now,
  );
  const limiter = new LoginLimiter(options.now);
  const app = Fastify({ bodyLimit: 4096, trustProxy: false, logger: false });
  await app.register(cookie, { secret: config.SESSION_SECRET });
  await app.register(helmet, {
    hsts: config.NODE_ENV === "production",
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  });
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("Pragma", "no-cache");
  });
  const cleanup = setInterval(() => sessions.prune(), 60000);
  cleanup.unref();
  app.addHook("onClose", async () => { clearInterval(cleanup); });
  app.setErrorHandler<{ statusCode?: number }>((error, _request, reply) => {
    const status = error.statusCode && error.statusCode >= 400 && error.statusCode < 500
      ? error.statusCode : 500;
    reply.code(status).send({
      code: status === 500 ? "INTERNAL_ERROR" : "INVALID_REQUEST",
      message: status === 500 ? "No se pudo completar la operación" : "Solicitud inválida",
    });
  });

  function readId(request: FastifyRequest): string | null {
    const value = request.cookies[SESSION_COOKIE];
    if (!value) return null;
    const result = request.unsignCookie(value);
    return result.valid ? result.value : null;
  }

  function clearCookie(reply: FastifyReply): void {
    reply.clearCookie(SESSION_COOKIE, {
      path: "/api/v1",
      httpOnly: true,
      secure: config.NODE_ENV === "production",
      sameSite: "strict",
    });
  }

  function setCookie(reply: FastifyReply, id: string, expiresAt: number): void {
    reply.setCookie(SESSION_COOKIE, id, {
      signed: true,
      httpOnly: true,
      secure: config.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/v1",
      expires: new Date(expiresAt),
    });
  }

  function resolveSession(request: FastifyRequest, reply: FastifyReply) {
    const id = readId(request);
    const current = id ? sessions.consume(id) : null;
    if (!current) {
      if (request.cookies[SESSION_COOKIE]) clearCookie(reply);
      return null;
    }
    const expiresAt = sessions.expiresAt(current.session);
    setCookie(reply, current.id, expiresAt);
    return { ...current, expiresAt };
  }

  app.get("/health", async () => ({ status: "ok" }));

  app.post(authRoutes.login, async (request, reply) => {
    if (request.headers.origin !== config.AUTH_ORIGIN) {
      return reply.code(403).send({ code: "INVALID_ORIGIN", message: "Origen no permitido" });
    }
    const input = loginRequestSchema.safeParse(request.body);
    if (!input.success) {
      return reply.code(400).send({ code: "INVALID_REQUEST", message: "Credenciales inválidas" });
    }
    const { username, password } = input.data;
    const retryAfter = limiter.take(request.ip, username);
    if (retryAfter) {
      return reply.header("Retry-After", retryAfter).code(429).send({
        code: "LOGIN_BLOCKED", message: "Demasiados intentos. Intente más tarde",
      });
    }
    try {
      const identity = await directory.authenticate(username, password);
      const user = identity ? mapIdentity(identity) : null;
      if (!user || !sessionUserSchema.safeParse(user).success) {
        return reply.code(401).send({
          code: "INVALID_CREDENTIALS", message: "Usuario o contraseña incorrectos",
        });
      }
      const current = sessions.create(user);
      const previousId = readId(request);
      if (previousId) sessions.destroy(previousId);
      limiter.success(username);
      const expiresAt = sessions.expiresAt(current.session);
      setCookie(reply, current.id, expiresAt);
      return {
        authenticated: true,
        user,
        csrfToken: current.session.csrfToken,
        expiresAt: new Date(expiresAt).toISOString(),
      } satisfies SessionResponse;
    } catch (error) {
      if (error instanceof DirectoryUnavailableError) {
        return reply.code(503).send({
          code: "DIRECTORY_UNAVAILABLE", message: "Autenticación temporalmente no disponible",
        });
      }
      throw error;
    }
  });

  app.get(authRoutes.session, async (request, reply) => {
    const current = resolveSession(request, reply);
    return {
      authenticated: current !== null,
      user: current?.session.user ?? null,
      csrfToken: current?.session.csrfToken ?? null,
      expiresAt: current ? new Date(current.expiresAt).toISOString() : null,
    } satisfies SessionResponse;
  });

  app.post(authRoutes.logout, async (request, reply) => {
    if (request.headers.origin !== config.AUTH_ORIGIN) {
      return reply.code(403).send({ code: "INVALID_ORIGIN", message: "Origen no permitido" });
    }
    const current = resolveSession(request, reply);
    if (!current) {
      return reply.code(401).send({ code: "UNAUTHENTICATED", message: "Se requiere sesión" });
    }
    const token = request.headers["x-csrf-token"];
    if (typeof token !== "string" || !equalTokens(token, current.session.csrfToken)) {
      return reply.code(403).send({ code: "INVALID_CSRF", message: "Token CSRF inválido" });
    }
    sessions.destroy(current.id);
    clearCookie(reply);
    return reply.code(204).send();
  });

  return app;
}
