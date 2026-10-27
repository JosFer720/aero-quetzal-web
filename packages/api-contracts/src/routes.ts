export const PUBLIC_API_PREFIX = "/api/v1/public";
export const INTERNAL_API_PREFIX = "/api/v1/internal";
export const AUTH_API_PREFIX = "/api/v1/auth";

export const publicRoutes = {
  airports: `${PUBLIC_API_PREFIX}/airports`,
  flights: `${PUBLIC_API_PREFIX}/flights`,
  flightAvailability: (id: string) =>
    `${PUBLIC_API_PREFIX}/flights/${encodeURIComponent(id)}/availability`,
  reservations: `${PUBLIC_API_PREFIX}/reservations`,
  reservation: (code: string) =>
    `${PUBLIC_API_PREFIX}/reservations/${encodeURIComponent(code)}`,
  cancelReservation: (code: string) =>
    `${PUBLIC_API_PREFIX}/reservations/${encodeURIComponent(code)}/cancel`,
  flightStatus: (flightNumber: string) =>
    `${PUBLIC_API_PREFIX}/status/${encodeURIComponent(flightNumber)}`,
} as const;

export const internalRoutes = {
  airports: `${INTERNAL_API_PREFIX}/airports`,
  aircraft: `${INTERNAL_API_PREFIX}/aircraft`,
  flights: `${INTERNAL_API_PREFIX}/flights`,
  flight: (id: string) => `${INTERNAL_API_PREFIX}/flights/${encodeURIComponent(id)}`,
  flightInstances: `${INTERNAL_API_PREFIX}/flight-instances`,
  flightInstanceStatus: (id: string) =>
    `${INTERNAL_API_PREFIX}/flight-instances/${encodeURIComponent(id)}/status`,
  reservations: `${INTERNAL_API_PREFIX}/reservations`,
  reservation: (code: string) =>
    `${INTERNAL_API_PREFIX}/reservations/${encodeURIComponent(code)}`,
  checkIn: (code: string) =>
    `${INTERNAL_API_PREFIX}/reservations/${encodeURIComponent(code)}/check-in`,
  audit: `${INTERNAL_API_PREFIX}/audit`,
  dashboard: `${INTERNAL_API_PREFIX}/dashboard`,
} as const;

export const authRoutes = {
  login: `${AUTH_API_PREFIX}/login`,
  session: `${AUTH_API_PREFIX}/session`,
  logout: `${AUTH_API_PREFIX}/logout`,
} as const;
