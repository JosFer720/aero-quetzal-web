import { createPrismaClient } from "../src/client.js";

const prisma = createPrismaClient();

const airports = [
  {
    code: "GUA",
    name: "Aeropuerto Internacional La Aurora",
    city: "Ciudad de Guatemala",
    country: "Guatemala",
    timezone: "America/Guatemala",
  },
  {
    code: "SAL",
    name: "Aeropuerto Internacional de El Salvador",
    city: "San Salvador",
    country: "El Salvador",
    timezone: "America/El_Salvador",
  },
  {
    code: "SJO",
    name: "Aeropuerto Internacional Juan Santamaría",
    city: "San José",
    country: "Costa Rica",
    timezone: "America/Costa_Rica",
  },
  {
    code: "MEX",
    name: "Aeropuerto Internacional de la Ciudad de México",
    city: "Ciudad de México",
    country: "México",
    timezone: "America/Mexico_City",
  },
  {
    code: "PTY",
    name: "Aeropuerto Internacional de Tocumen",
    city: "Ciudad de Panamá",
    country: "Panamá",
    timezone: "America/Panama",
  },
] as const;

const aircraft = [
  { registration: "TG-AQ01", model: "ATR 72-600", capacity: 72 },
  { registration: "TG-AQ02", model: "Embraer E190", capacity: 96 },
] as const;

function parseBaseDate(): Date {
  const configured = process.env.SEED_BASE_DATE ?? "2026-11-05";
  const date = new Date(`${configured}T00:00:00-06:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("SEED_BASE_DATE debe usar el formato YYYY-MM-DD");
  }
  return date;
}

function at(base: Date, dayOffset: number, hour: number, minute = 0): Date {
  const value = new Date(base);
  value.setUTCDate(value.getUTCDate() + dayOffset);
  value.setUTCHours(hour + 6, minute, 0, 0);
  return value;
}

async function main() {
  const airportByCode = new Map<string, { id: string }>();
  for (const airport of airports) {
    const saved = await prisma.airport.upsert({
      where: { code: airport.code },
      update: { ...airport, active: true },
      create: { ...airport, active: true },
      select: { id: true },
    });
    airportByCode.set(airport.code, saved);
  }

  const aircraftByRegistration = new Map<string, { id: string; capacity: number }>();
  for (const item of aircraft) {
    const saved = await prisma.aircraft.upsert({
      where: { registration: item.registration },
      update: { model: item.model, capacity: item.capacity, active: true },
      create: { ...item, active: true },
      select: { id: true, capacity: true },
    });
    aircraftByRegistration.set(item.registration, saved);
  }

  const routeDefinitions = [
    { flightNumber: "AQ101", origin: "GUA", destination: "MEX", durationMinutes: 150 },
    { flightNumber: "AQ205", origin: "GUA", destination: "SJO", durationMinutes: 105 },
    { flightNumber: "AQ310", origin: "GUA", destination: "PTY", durationMinutes: 135 },
    { flightNumber: "AQ118", origin: "GUA", destination: "SAL", durationMinutes: 50 },
  ] as const;

  const flightByNumber = new Map<string, { id: string; durationMinutes: number }>();
  for (const route of routeDefinitions) {
    const originId = airportByCode.get(route.origin)?.id;
    const destinationId = airportByCode.get(route.destination)?.id;
    if (!originId || !destinationId) {
      throw new Error(`No se encontraron los aeropuertos de ${route.flightNumber}`);
    }

    const saved = await prisma.flight.upsert({
      where: { flightNumber: route.flightNumber },
      update: {
        originId,
        destinationId,
        durationMinutes: route.durationMinutes,
        active: true,
      },
      create: {
        flightNumber: route.flightNumber,
        originId,
        destinationId,
        durationMinutes: route.durationMinutes,
        active: true,
      },
      select: { id: true, durationMinutes: true },
    });
    flightByNumber.set(route.flightNumber, saved);
  }

  const baseDate = parseBaseDate();
  const schedule = [
    { flightNumber: "AQ101", registration: "TG-AQ02", day: 0, hour: 7 },
    { flightNumber: "AQ205", registration: "TG-AQ01", day: 0, hour: 10 },
    { flightNumber: "AQ310", registration: "TG-AQ02", day: 0, hour: 14 },
    { flightNumber: "AQ118", registration: "TG-AQ01", day: 0, hour: 17 },
    { flightNumber: "AQ101", registration: "TG-AQ02", day: 1, hour: 7 },
    { flightNumber: "AQ205", registration: "TG-AQ01", day: 1, hour: 10 },
    { flightNumber: "AQ310", registration: "TG-AQ02", day: 1, hour: 14 },
    { flightNumber: "AQ118", registration: "TG-AQ01", day: 1, hour: 17 },
  ] as const;

  for (const item of schedule) {
    const flight = flightByNumber.get(item.flightNumber);
    const assignedAircraft = aircraftByRegistration.get(item.registration);
    if (!flight || !assignedAircraft) {
      throw new Error(`No se pudo preparar el horario de ${item.flightNumber}`);
    }

    const departureAt = at(baseDate, item.day, item.hour);
    const arrivalAt = new Date(departureAt.getTime() + flight.durationMinutes * 60_000);
    await prisma.flightInstance.upsert({
      where: {
        flightId_departureAt: { flightId: flight.id, departureAt },
      },
      update: {
        aircraftId: assignedAircraft.id,
        arrivalAt,
        capacity: assignedAircraft.capacity,
      },
      create: {
        flightId: flight.id,
        aircraftId: assignedAircraft.id,
        departureAt,
        arrivalAt,
        capacity: assignedAircraft.capacity,
      },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
