import { randomInt } from "node:crypto";
import { Prisma, type DatabaseClient, type DatabaseTransaction, createRepositories } from "@aeroquetzal/database";
import { assertCanReserve, assertFlightTransition } from "@aeroquetzal/domain";
import type {
  CreateReservationRequest, FlightSearchQuery, CreateFlightRequest, UpdateFlightRequest,
  CreateFlightInstanceRequest, UpdateFlightStatusRequest, CheckInRequest,
} from "@aeroquetzal/api-contracts";
import { BusinessError, conflict, missing } from "./errors.js";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function reservationCode(): string {
  return "AQ" + Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join("");
}
export function seatNumber(index: number): string {
  return `${Math.floor(index / 6) + 1}${"ABCDEF"[index % 6]}`;
}
export function searchRange(date: string) {
  const departureFrom = new Date(`${date}T00:00:00-06:00`);
  return { departureFrom, departureTo: new Date(departureFrom.getTime() + 86_400_000) };
}
const flightInclude = { origin: true, destination: true } as const;
const instanceInclude = { flight: { include: flightInclude }, aircraft: true } as const;
const bookingInclude = {
  flightInstance: { include: instanceInclude },
  passengers: { include: { passenger: true, checkIn: true, seatAssignment: true }, orderBy: { id: "asc" as const } },
} as const;
type FlightRow = Prisma.FlightGetPayload<{ include: typeof flightInclude }>;
type InstanceRow = Prisma.FlightInstanceGetPayload<{ include: typeof instanceInclude }>;
type BookingRow = Prisma.ReservationGetPayload<{ include: typeof bookingInclude }>;
const airportDto = (row: { code: string; name: string; city: string; country: string }) => ({
  code: row.code, name: row.name, city: row.city, country: row.country,
});
export const flightDto = (row: FlightRow) => ({
  id: row.id, flightNumber: row.flightNumber, origin: row.origin.code,
  destination: row.destination.code, durationMinutes: row.durationMinutes, active: row.active,
});
export const instanceDto = (row: InstanceRow) => ({
  id: row.id, flightId: row.flightId, aircraftId: row.aircraftId, flightNumber: row.flight.flightNumber,
  origin: row.flight.origin.code, destination: row.flight.destination.code,
  departureAt: row.departureAt.toISOString(), arrivalAt: row.arrivalAt.toISOString(),
  status: row.status, capacity: row.capacity, reservedSeats: row.reservedSeats,
  availableSeats: row.capacity - row.reservedSeats,
});
export const bookingDto = (row: BookingRow) => ({
  id: row.id, code: row.code, status: row.status, contactEmail: row.contactEmail,
  flightInstanceId: row.flightInstanceId, createdAt: row.createdAt.toISOString(),
  passengers: row.passengers.map((link) => ({
    id: link.passenger.id, firstName: link.passenger.firstName, lastName: link.passenger.lastName,
    documentNumber: link.passenger.documentNumber, seatNumber: link.seatAssignment?.seatNumber ?? null,
    checkedInAt: link.checkIn?.checkedInAt.toISOString() ?? null,
  })),
});

export class BusinessService {
  constructor(readonly db: DatabaseClient, private readonly now = () => new Date(), private readonly code = reservationCode) {}

  // All inventory operations lock the same flight instance before reading/changing reservation state.
  private async lockInstance(tx: DatabaseTransaction, id: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM flight_instances WHERE id = ${id} FOR UPDATE`;
    if (!rows.length) missing();
    return tx.flightInstance.findUniqueOrThrow({ where: { id }, include: instanceInclude });
  }

  private async transaction<T>(work: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.$transaction(work, { maxWait: 10000, timeout: 15000 });
      } catch (error) {
        if (attempt < 4 && error instanceof Prisma.PrismaClientKnownRequestError &&
            ["P2002", "P2034"].includes(error.code)) continue;
        throw error;
      }
    }
  }
  private async audit(tx: DatabaseTransaction, actor: string, action: string, entityType: string, entityId: string) {
    await createRepositories(tx).auditEvents.create({ actor, action, entityType, entityId, details: {} });
  }
  private reservable(row: InstanceRow) {
    if (row.status !== "SCHEDULED" || row.departureAt <= this.now() || !row.flight.active ||
        !row.flight.origin.active || !row.flight.destination.active || !row.aircraft.active) {
      conflict("El vuelo no está disponible para reservar");
    }
  }
  async airports() {
    return (await createRepositories(this.db).airports.listActive()).map(airportDto);
  }
  async search(query: FlightSearchQuery) {
    const results = await createRepositories(this.db).flightInstances.search({
      originCode: query.origin, destinationCode: query.destination, ...searchRange(query.date),
    });
    return results.filter((row) => row.instance.status === "SCHEDULED" && row.instance.departureAt > this.now() && row.aircraft.active)
      .map((row) => ({
        id: row.instance.id, flightNumber: row.flight.flightNumber, origin: airportDto(row.origin),
        destination: airportDto(row.destination), departureAt: row.instance.departureAt.toISOString(),
        arrivalAt: row.instance.arrivalAt.toISOString(), status: row.instance.status, availableSeats: row.availableSeats,
      }));
  }
  async availability(id: string) {
    const row = await this.db.flightInstance.findUnique({ where: { id }, include: instanceInclude });
    if (!row) missing();
    let availableSeats = 0;
    try { this.reservable(row); availableSeats = row.capacity - row.reservedSeats; }
    catch (error) { if (!(error instanceof BusinessError)) throw error; }
    return { flightInstanceId: id, capacity: row.capacity, availableSeats };
  }
  async reserve(body: CreateReservationRequest) {
    const documents = body.passengers.map((person) => person.documentNumber);
    if (new Set(documents).size !== documents.length) {
      throw new BusinessError(400, "DUPLICATE_PASSENGER", "Los documentos no deben repetirse");
    }
    return this.transaction(async (tx) => {
      const instance = await this.lockInstance(tx, body.flightInstanceId);
      this.reservable(instance);
      assertCanReserve(instance.capacity, instance.reservedSeats, body.passengers.length);
      const links: { passengerId: string }[] = [];
      // Stable order avoids deadlocks when two reservations share several documents.
      for (const input of [...body.passengers].sort((a, b) => a.documentNumber.localeCompare(b.documentNumber))) {
        const person = await tx.passenger.upsert({ where: { documentNumber: input.documentNumber }, create: input, update: {} });
        if (person.firstName !== input.firstName || person.lastName !== input.lastName) conflict("Los datos del pasajero no coinciden");
        const duplicate = await tx.reservationPassenger.findFirst({ where: {
          passengerId: person.id, reservation: { flightInstanceId: instance.id, status: { not: "CANCELLED" } },
        } });
        if (duplicate) conflict("Un pasajero ya tiene una reserva en este vuelo");
        links.push({ passengerId: person.id });
      }
      const row = await tx.reservation.create({ data: {
        code: this.code(), flightInstanceId: instance.id, contactEmail: body.contactEmail,
        passengerCount: links.length, passengers: { create: links },
      } });
      await createRepositories(tx).flightInstances.adjustReservedSeats(instance.id, links.length);
      await this.audit(tx, "public", "RESERVATION_CREATED", "Reservation", row.id);
      return { code: row.code, status: "CONFIRMED" as const, message: "Reserva gratuita confirmada" as const };
    });
  }
  private async booking(tx: DatabaseTransaction | DatabaseClient, code: string) {
    const row = await tx.reservation.findUnique({ where: { code }, include: bookingInclude });
    if (!row) missing();
    return row;
  }
  private verify(row: BookingRow, document: string) {
    if (!row.passengers.some((link) => link.passenger.documentNumber === document)) missing();
  }
  async lookup(code: string, document: string) {
    const row = await this.booking(this.db, code);
    this.verify(row, document);
    const flight = row.flightInstance.flight;
    return { code: row.code, status: row.status, flightNumber: flight.flightNumber,
      origin: flight.origin.code, destination: flight.destination.code,
      departureAt: row.flightInstance.departureAt.toISOString(), passengerCount: row.passengerCount };
  }
  async cancel(code: string, document: string) {
    return this.transaction(async (tx) => {
      let row = await this.booking(tx, code);
      this.verify(row, document);
      await this.lockInstance(tx, row.flightInstanceId);
      row = await this.booking(tx, code);
      if (row.status !== "CONFIRMED" || row.passengers.some((link) => link.checkIn)) conflict("La reserva no puede cancelarse");
      await createRepositories(tx).reservations.updateStatus(row.id, "CANCELLED", this.now());
      await createRepositories(tx).flightInstances.adjustReservedSeats(row.flightInstanceId, -row.passengerCount);
      await this.audit(tx, "public", "RESERVATION_CANCELLED", "Reservation", row.id);
      return { code: row.code, status: "CANCELLED" as const, restoredSeats: row.passengerCount };
    });
  }
  async status(flightNumber: string) {
    const now = this.now();
    // Prefer the next departure; fall back to the most recent completed departure.
    const where = { flight: { flightNumber, active: true } };
    const row = await this.db.flightInstance.findFirst({ where: { ...where, departureAt: { gte: now } }, orderBy: { departureAt: "asc" } }) ??
      await this.db.flightInstance.findFirst({ where, orderBy: { departureAt: "desc" } });
    if (!row) missing();
    return { flightNumber, status: row.status, departureAt: row.departureAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  }
  async internalAirports() {
    return (await this.db.airport.findMany({ orderBy: { code: "asc" } })).map((row) => ({ id: row.id, ...airportDto(row), active: row.active }));
  }
  async aircraft() {
    return (await this.db.aircraft.findMany({ orderBy: { registration: "asc" } })).map((row) => ({
      id: row.id, registration: row.registration, model: row.model, capacity: row.capacity, active: row.active,
    }));
  }
  async flights() {
    return (await this.db.flight.findMany({ include: flightInclude, orderBy: { flightNumber: "asc" } })).map(flightDto);
  }
  async saveFlight(actor: string, body: CreateFlightRequest | UpdateFlightRequest, id?: string) {
    return this.transaction(async (tx) => {
      const current = id ? await tx.flight.findUnique({ where: { id }, include: flightInclude }) : null;
      if (id && !current) missing();
      const origin = await tx.airport.findUnique({ where: { code: body.origin ?? current!.origin.code } });
      const destination = await tx.airport.findUnique({ where: { code: body.destination ?? current!.destination.code } });
      if (!origin || !destination) missing();
      if (origin.id === destination.id || !origin.active || !destination.active) conflict("Ruta no válida");
      if (current && (origin.id !== current.originId || destination.id !== current.destinationId) &&
          await tx.reservation.count({ where: { flightInstance: { flightId: current.id } } })) {
        conflict("Una ruta con reservas conserva sus aeropuertos");
      }
      const data = {
        originId: origin.id, destinationId: destination.id,
        ...(body.flightNumber !== undefined ? { flightNumber: body.flightNumber } : {}),
        ...(body.durationMinutes !== undefined ? { durationMinutes: body.durationMinutes } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      };
      const row = current
        ? await tx.flight.update({ where: { id: current.id }, data, include: flightInclude })
        : await tx.flight.create({ data: { ...data, flightNumber: body.flightNumber!, durationMinutes: body.durationMinutes! }, include: flightInclude });
      await this.audit(tx, actor, current ? "FLIGHT_UPDATED" : "FLIGHT_CREATED", "Flight", row.id);
      return flightDto(row);
    });
  }
  async instances() {
    return (await this.db.flightInstance.findMany({ include: instanceInclude, orderBy: { departureAt: "asc" } })).map(instanceDto);
  }
  async createInstance(actor: string, body: CreateFlightInstanceRequest) {
    return this.transaction(async (tx) => {
      const flight = await tx.flight.findUnique({ where: { id: body.flightId }, include: flightInclude });
      // Serializes schedule creation on the same aircraft, including overlaps between different routes.
      await tx.$queryRaw`SELECT id FROM aircraft WHERE id = ${body.aircraftId} FOR UPDATE`;
      const aircraft = await tx.aircraft.findUnique({ where: { id: body.aircraftId } });
      if (!flight || !aircraft) missing();
      if (!flight.active || !flight.origin.active || !flight.destination.active || !aircraft.active || body.capacity > aircraft.capacity || new Date(body.departureAt) <= this.now()) {
        conflict("Vuelo, aeronave, capacidad o fecha no válidos");
      }
      if (await tx.flightInstance.findFirst({ where: {
        aircraftId: aircraft.id, status: { not: "CANCELLED" }, departureAt: { lt: new Date(body.arrivalAt) }, arrivalAt: { gt: new Date(body.departureAt) },
      } })) conflict("La aeronave ya tiene un vuelo en ese horario");
      const row = await tx.flightInstance.create({ data: { ...body, departureAt: new Date(body.departureAt), arrivalAt: new Date(body.arrivalAt) }, include: instanceInclude });
      await this.audit(tx, actor, "FLIGHT_INSTANCE_CREATED", "FlightInstance", row.id);
      return instanceDto(row);
    });
  }
  async updateStatus(actor: string, id: string, body: UpdateFlightStatusRequest) {
    return this.transaction(async (tx) => {
      const current = await this.lockInstance(tx, id);
      assertFlightTransition(current.status, body.status);
      const row = await tx.flightInstance.update({ where: { id }, data: { status: body.status }, include: instanceInclude });
      await this.audit(tx, actor, "FLIGHT_STATUS_UPDATED", "FlightInstance", row.id);
      return instanceDto(row);
    });
  }
  async reservations(q: string) {
    const contains = { contains: q, mode: "insensitive" as const };
    return (await this.db.reservation.findMany({ where: { OR: [
      { code: contains }, { passengers: { some: { passenger: { OR: [{ firstName: contains }, { lastName: contains }, { documentNumber: contains }] } } } },
    ] }, include: bookingInclude, orderBy: { createdAt: "desc" }, take: 100 })).map(bookingDto);
  }
  async internalReservation(code: string) { return bookingDto(await this.booking(this.db, code)); }
  async checkIn(actor: string, code: string, body: CheckInRequest) {
    return this.transaction(async (tx) => {
      let row = await this.booking(tx, code);
      const instance = await this.lockInstance(tx, row.flightInstanceId);
      row = await this.booking(tx, code);
      if (body.passengerIds && (body.passengerIds.length !== row.passengers.length || new Set(body.passengerIds).size !== row.passengers.length ||
          !row.passengers.every((link) => body.passengerIds!.includes(link.passengerId)))) {
        throw new BusinessError(400, "INVALID_PASSENGERS", "El Check-In debe incluir a todos los pasajeros de la reserva");
      }
      if (row.status === "CHECKED_IN") return this.checkInDto(row);
      if (row.status !== "CONFIRMED" || !["SCHEDULED", "BOARDING"].includes(instance.status)) conflict("La reserva o el vuelo no permiten Check-In");
      const occupied = new Set((await tx.seatAssignment.findMany({ where: { flightInstanceId: instance.id } })).map((seat) => seat.seatNumber));
      let index = 0;
      for (const link of row.passengers) {
        if (link.checkIn) continue;
        while (index < instance.capacity && occupied.has(seatNumber(index))) index++;
        if (index >= instance.capacity) conflict("No hay asiento disponible");
        const seat = seatNumber(index++);
        occupied.add(seat);
        await createRepositories(tx).checkIns.assignSeat(link.id, instance.id, seat);
        await createRepositories(tx).checkIns.create(link.id, actor);
      }
      await createRepositories(tx).reservations.updateStatus(row.id, "CHECKED_IN");
      await this.audit(tx, actor, "CHECK_IN", "Reservation", row.id);
      return this.checkInDto(await this.booking(tx, code));
    });
  }
  private checkInDto(row: BookingRow) {
    return { reservationCode: row.code, status: "CHECKED_IN" as const,
      seats: row.passengers.map((link) => ({ passengerId: link.passengerId, seatNumber: link.seatAssignment!.seatNumber })) };
  }
  async auditEvents() {
    return (await createRepositories(this.db).auditEvents.listRecent(100)).map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }
  async dashboard() {
    const [scheduledFlights, boardingFlights, confirmedReservations, checkedInPassengers] = await this.db.$transaction([
      this.db.flightInstance.count({ where: { status: "SCHEDULED" } }),
      this.db.flightInstance.count({ where: { status: "BOARDING" } }),
      this.db.reservation.count({ where: { status: "CONFIRMED" } }), this.db.checkIn.count(),
    ]);
    return { scheduledFlights, boardingFlights, confirmedReservations, checkedInPassengers };
  }
}
