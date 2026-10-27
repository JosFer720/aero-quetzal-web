import { Badge } from "@aeroquetzal/ui/badge";
import type { FlightStatus, ReservationStatus } from "@aeroquetzal/domain";

export const statusLabels: Record<FlightStatus | ReservationStatus, string> = {
  SCHEDULED: "Programado",
  BOARDING: "En abordaje",
  DEPARTED: "En vuelo",
  ARRIVED: "Aterrizado",
  CANCELLED: "Cancelado",
  CONFIRMED: "Confirmada",
  CHECKED_IN: "Check-In completado",
};

export function StatusBadge({
  status,
}: {
  status: FlightStatus | ReservationStatus;
}) {
  const color =
    status === "CANCELLED"
      ? "bg-coral"
      : status === "CHECKED_IN" || status === "ARRIVED"
        ? "bg-mint"
        : status === "BOARDING" || status === "DEPARTED"
          ? "bg-sky"
          : "bg-primary";
  return (
    <Badge variant="outline" className={color + " h-auto min-h-6 py-1"}>
      {statusLabels[status]}
    </Badge>
  );
}

const formatter = new Intl.DateTimeFormat("es-GT", {
  timeZone: "America/Guatemala",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
export function formatDate(value: string): string {
  return formatter.format(new Date(value));
}
export function localDate(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guatemala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function toUtc(value: string): string {
  const date = new Date(value + "-06:00");
  if (Number.isNaN(date.getTime())) throw new Error("Fecha inválida");
  return date.toISOString();
}
