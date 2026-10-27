import { authRoutes, sessionResponseSchema, type SessionUser } from "@aeroquetzal/api-contracts";
import type { AppRole } from "@aeroquetzal/domain";
import type { FastifyReply, FastifyRequest } from "fastify";

import { equalTokens } from "./sessions.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser: SessionUser | null;
  }
}

export function createAuthGuard(options: {
  authUrl: string;
  origin: string;
  roles: readonly AppRole[];
  fetch?: typeof fetch;
}) {
  const sessionUrl = new URL(authRoutes.session, options.authUrl);
  if (!["http:", "https:"].includes(sessionUrl.protocol) ||
      sessionUrl.username || sessionUrl.password) {
    throw new Error("Auth requiere una URL HTTP interna sin credenciales");
  }
  const fetchSession = options.fetch ?? fetch;
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    reply.header("Cache-Control", "no-store");
    const unsafe = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    if (unsafe && request.headers.origin !== options.origin) {
      reply.code(403).send({ code: "INVALID_ORIGIN", message: "Origen no permitido" });
      return;
    }
    if (!request.headers.cookie) {
      reply.code(401).send({ code: "UNAUTHENTICATED", message: "Se requiere sesión" });
      return;
    }
    let session;
    try {
      const response = await fetchSession(sessionUrl, {
        headers: { cookie: request.headers.cookie },
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });
      if (!response.ok) throw new Error("Auth no disponible");
      session = sessionResponseSchema.parse(await response.json());
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header("Set-Cookie", cookies);
    } catch {
      reply.code(503).send({ code: "AUTH_UNAVAILABLE", message: "Autenticación no disponible" });
      return;
    }
    if (!session.authenticated || !session.user || !session.csrfToken || !session.expiresAt ||
        Date.parse(session.expiresAt) <= Date.now()) {
      reply.code(401).send({ code: "UNAUTHENTICATED", message: "Se requiere sesión" });
      return;
    }
    const token = request.headers["x-csrf-token"];
    if (unsafe && (typeof token !== "string" || !equalTokens(token, session.csrfToken))) {
      reply.code(403).send({ code: "INVALID_CSRF", message: "Token CSRF inválido" });
      return;
    }
    if (!session.user.roles.includes("admin") &&
        !options.roles.some((role) => session.user!.roles.includes(role))) {
      reply.code(403).send({ code: "FORBIDDEN", message: "Rol insuficiente" });
      return;
    }
    request.authUser = session.user;
  };
}
