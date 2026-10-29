import {
  airportSchema,
  flightSearchQuerySchema,
  publicFlightSchema,
  flightAvailabilitySchema,
  createReservationRequestSchema,
  createReservationResponseSchema,
  reservationCodeSchema,
  reservationLookupQuerySchema,
  publicReservationSchema,
  cancelReservationRequestSchema,
  cancelReservationResponseSchema,
  flightNumberSchema,
  publicFlightStatusSchema,
  publicRoutes,
  type FlightSearchQuery,
  type CreateReservationRequest,
} from "@aeroquetzal/api-contracts";
import { z } from "zod";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "No se pudo conectar con el servicio. Intenta de nuevo.";
}

export function createPublicApi(
  send: typeof fetch = (...args) => fetch(...args),
) {
  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
    body?: unknown,
  ): Promise<T> {
    // El navegador sólo conoce rutas públicas relativas. Nunca transporta la sesión interna.
    const timeout = AbortSignal.timeout(15_000);
    let response: Response;
    try {
      response = await send(path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ApiError(
        0,
        "CONNECTION_FAILED",
        body === undefined
          ? "No se pudo conectar con el servicio. Intenta de nuevo."
          : "No pudimos verificar el resultado. Consulta tu reserva antes de repetir la operación. Si no recibiste un código, solicita ayuda al personal de AeroQuetzal.",
      );
    }
    if (signal?.aborted)
      throw new DOMException("Solicitud cancelada", "AbortError");
    if (!response.ok) {
      const message =
        response.status === 404
          ? "No se encontró el registro con los datos ingresados."
          : response.status === 409
            ? "La disponibilidad o el estado cambió. Actualiza los datos antes de continuar."
            : response.status === 429
              ? "Demasiados intentos. Espera un momento antes de volver a intentar."
              : response.status === 400
                ? "Revisa los datos ingresados e intenta de nuevo."
                : body === undefined
                  ? "El servicio no pudo completar la solicitud. Intenta de nuevo."
                  : "El servicio no pudo verificar el resultado. Consulta tu reserva antes de repetir la operación.";
      // No mostramos mensajes arbitrarios del servidor ni detalles privados en el portal público.
      throw new ApiError(response.status, "REQUEST_FAILED", message);
    }
    const parsed = schema.safeParse(await response.json().catch(() => null));
    if (!parsed.success)
      throw new ApiError(
        502,
        "INVALID_RESPONSE",
        body === undefined
          ? "El servicio devolvió datos inválidos. Intenta de nuevo."
          : "El servicio respondió de forma inesperada. Verifica tu reserva antes de repetir la operación.",
      );
    return parsed.data;
  }
  return {
    airports: (signal?: AbortSignal) =>
      request(publicRoutes.airports, z.array(airportSchema), signal),
    flights: (query: FlightSearchQuery, signal?: AbortSignal) =>
      request(
        publicRoutes.flights +
          "?" +
          new URLSearchParams(flightSearchQuerySchema.parse(query)),
        z.array(publicFlightSchema),
        signal,
      ),
    availability: (id: string, signal?: AbortSignal) =>
      request(
        publicRoutes.flightAvailability(id),
        flightAvailabilitySchema.refine(
          (value) =>
            value.flightInstanceId === id &&
            value.availableSeats <= value.capacity,
        ),
        signal,
      ),
    reserve: (body: CreateReservationRequest) =>
      request(
        publicRoutes.reservations,
        createReservationResponseSchema,
        undefined,
        createReservationRequestSchema.parse(body),
      ),
    reservation: (code: string, documentNumber: string, signal?: AbortSignal) =>
      request(
        publicRoutes.reservation(reservationCodeSchema.parse(code)) +
          "?" +
          new URLSearchParams(
            reservationLookupQuerySchema.parse({ documentNumber }),
          ),
        publicReservationSchema.refine(
          (value) => value.code === reservationCodeSchema.parse(code),
        ),
        signal,
      ),
    cancel: (code: string, documentNumber: string) =>
      request(
        publicRoutes.cancelReservation(reservationCodeSchema.parse(code)),
        cancelReservationResponseSchema.refine(
          (value) => value.code === reservationCodeSchema.parse(code),
        ),
        undefined,
        cancelReservationRequestSchema.parse({ documentNumber }),
      ),
    status: (flightNumber: string, signal?: AbortSignal) =>
      request(
        publicRoutes.flightStatus(flightNumberSchema.parse(flightNumber)),
        publicFlightStatusSchema.refine(
          (value) =>
            value.flightNumber === flightNumberSchema.parse(flightNumber),
        ),
        signal,
      ),
  };
}

export type PublicApi = ReturnType<typeof createPublicApi>;
export const publicApi = createPublicApi();
