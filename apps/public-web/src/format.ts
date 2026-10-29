export const flightLabels = {
  SCHEDULED: "Programado",
  BOARDING: "En abordaje",
  DEPARTED: "En vuelo",
  ARRIVED: "Llegó",
  CANCELLED: "Cancelado",
};
export const reservationLabels = {
  CONFIRMED: "Confirmada",
  CHECKED_IN: "Check-In completado",
  CANCELLED: "Cancelada",
};
const dateTime = new Intl.DateTimeFormat("es-GT", {
  timeZone: "America/Guatemala",
  dateStyle: "medium",
  timeStyle: "short",
});
export function formatDate(value: string) {
  return dateTime.format(new Date(value));
}
export function today() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guatemala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join("-");
}
