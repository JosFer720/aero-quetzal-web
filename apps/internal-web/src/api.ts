import {
  authRoutes,
  internalRoutes,
  sessionResponseSchema,
  loginRequestSchema,
  internalFlightSchema,
  internalFlightInstanceSchema,
  internalAircraftSchema,
  internalAirportSchema,
  internalReservationSchema,
  internalReservationSearchSchema,
  createFlightRequestSchema,
  updateFlightRequestSchema,
  createFlightInstanceRequestSchema,
  updateFlightStatusRequestSchema,
  reservationCodeSchema,
  checkInResponseSchema,
  dashboardResponseSchema,
  auditEventSchema,
  errorResponseSchema,
  type CreateFlightRequest,
  type UpdateFlightRequest,
  type CreateFlightInstanceRequest,
  type UpdateFlightStatusRequest,
  type LoginRequest,
} from "@aeroquetzal/api-contracts";
import { z } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof z.ZodError)
    return error.issues[0]?.message ?? "Revisa los datos ingresados";
  return "No se pudo conectar con el servicio. Intenta de nuevo.";
}

export function createApi(options: {
  csrfToken: () => string | null;
  onUnauthorized: () => void;
  fetch?: typeof fetch;
}) {
  const send =
    options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  async function request<T>(
    path: string,
    schema: z.ZodType<T> | null,
    init: {
      method?: "GET" | "POST" | "PATCH";
      body?: unknown;
      signal?: AbortSignal | undefined;
      login?: boolean;
    } = {},
  ): Promise<T> {
    const method = init.method ?? "GET";
    const csrfAtStart = options.csrfToken();
    const headers = new Headers({ Accept: "application/json" });
    if (init.body !== undefined)
      headers.set("Content-Type", "application/json");
    if (method !== "GET" && !init.login) {
      const token = csrfAtStart;
      if (!token)
        throw new ApiError(
          403,
          "MISSING_CSRF",
          "La sesión no es válida. Inicia sesión nuevamente.",
        );
      headers.set("X-CSRF-Token", token);
    }
    const response = await send(path, {
      method,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      ...(init.signal ? { signal: init.signal } : {}),
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    if (init.signal?.aborted)
      throw new DOMException("Solicitud cancelada", "AbortError");
    if (!response.ok) {
      if (
        response.status === 401 &&
        !init.login &&
        options.csrfToken() === csrfAtStart
      )
        options.onUnauthorized();
      const payload = errorResponseSchema.safeParse(
        await response.json().catch(() => null),
      );
      const fallback =
        response.status === 403
          ? "No tienes permiso para realizar esta operación."
          : response.status === 404
            ? "No se encontró el registro solicitado."
            : response.status === 429
              ? "Demasiados intentos. Espera antes de volver a intentar."
              : "El servicio no pudo completar la solicitud. Intenta de nuevo.";
      throw new ApiError(
        response.status,
        payload.success ? payload.data.code : "REQUEST_FAILED",
        payload.success ? payload.data.message : fallback,
      );
    }
    if (response.status === 204 && schema === null) return undefined as T;
    const result = schema?.safeParse(await response.json().catch(() => null));
    if (!result?.success)
      throw new ApiError(
        502,
        "INVALID_RESPONSE",
        "El servicio devolvió datos inválidos. Intenta de nuevo.",
      );
    return result.data;
  }

  return {
    session: (signal?: AbortSignal) =>
      request(authRoutes.session, sessionResponseSchema, { signal }),
    login: (body: LoginRequest) =>
      request(authRoutes.login, sessionResponseSchema, {
        method: "POST",
        body: loginRequestSchema.parse(body),
        login: true,
      }),
    logout: () => request<void>(authRoutes.logout, null, { method: "POST" }),
    dashboard: (signal?: AbortSignal) =>
      request(internalRoutes.dashboard, dashboardResponseSchema, { signal }),
    flights: (signal?: AbortSignal) =>
      request(internalRoutes.flights, z.array(internalFlightSchema), {
        signal,
      }),
    airports: (signal?: AbortSignal) =>
      request(internalRoutes.airports, z.array(internalAirportSchema), {
        signal,
      }),
    aircraft: (signal?: AbortSignal) =>
      request(internalRoutes.aircraft, z.array(internalAircraftSchema), {
        signal,
      }),
    createFlight: (body: CreateFlightRequest) =>
      request(internalRoutes.flights, internalFlightSchema, {
        method: "POST",
        body: createFlightRequestSchema.parse(body),
      }),
    updateFlight: (id: string, body: UpdateFlightRequest) =>
      request(internalRoutes.flight(id), internalFlightSchema, {
        method: "PATCH",
        body: updateFlightRequestSchema.parse(body),
      }),
    instances: (signal?: AbortSignal) =>
      request(
        internalRoutes.flightInstances,
        z.array(internalFlightInstanceSchema),
        { signal },
      ),
    createInstance: (body: CreateFlightInstanceRequest) =>
      request(internalRoutes.flightInstances, internalFlightInstanceSchema, {
        method: "POST",
        body: createFlightInstanceRequestSchema.parse(body),
      }),
    updateStatus: (id: string, body: UpdateFlightStatusRequest) =>
      request(
        internalRoutes.flightInstanceStatus(id),
        internalFlightInstanceSchema,
        { method: "PATCH", body: updateFlightStatusRequestSchema.parse(body) },
      ),
    reservations: (query: string, signal?: AbortSignal) => {
      const params = new URLSearchParams(
        internalReservationSearchSchema.parse({ q: query }),
      );
      return request(
        internalRoutes.reservations + "?" + params.toString(),
        z.array(internalReservationSchema),
        { signal },
      );
    },
    reservation: (code: string, signal?: AbortSignal) =>
      request(
        internalRoutes.reservation(reservationCodeSchema.parse(code)),
        internalReservationSchema,
        { signal },
      ),
    checkIn: (code: string) =>
      request(
        internalRoutes.checkIn(reservationCodeSchema.parse(code)),
        checkInResponseSchema,
        { method: "POST", body: {} },
      ),
    audit: (signal?: AbortSignal) =>
      request(internalRoutes.audit, z.array(auditEventSchema), { signal }),
  };
}

export type InternalApi = ReturnType<typeof createApi>;
