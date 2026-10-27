import type {
  InternalReservation,
  CheckInResponse,
} from "@aeroquetzal/api-contracts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@aeroquetzal/ui/table";
import { StatusBadge, formatDate } from "./status";

export function ReservationDetails({
  reservation,
  completed,
}: {
  reservation: InternalReservation;
  completed?: CheckInResponse | null;
}) {
  return (
    <section
      className="mt-6 border-2 bg-card p-5 shadow-md"
      aria-label={"Detalle de reserva " + reservation.code}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest">Reserva</p>
          <h2 className="mt-2 text-xl">{reservation.code}</h2>
        </div>
        <StatusBadge status={completed?.status ?? reservation.status} />
      </div>
      <dl className="mb-5 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-bold">Contacto</dt>
          <dd className="mt-1 break-all">{reservation.contactEmail}</dd>
        </div>
        <div>
          <dt className="font-bold">Creada · hora de Guatemala</dt>
          <dd className="mt-1">{formatDate(reservation.createdAt)}</dd>
        </div>
      </dl>
      <Table aria-label="Pasajeros de la reserva">
        <TableHeader>
          <TableRow>
            <TableHead>Pasajero</TableHead>
            <TableHead>Documento</TableHead>
            <TableHead>Asiento</TableHead>
            <TableHead>Check-In</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reservation.passengers.map((passenger) => {
            const assigned = completed?.seats.find(
              (seat) => seat.passengerId === passenger.id,
            );
            return (
              <TableRow key={passenger.id}>
                <TableCell>
                  {passenger.firstName} {passenger.lastName}
                </TableCell>
                <TableCell>{passenger.documentNumber}</TableCell>
                <TableCell className="font-bold">
                  {assigned?.seatNumber ??
                    passenger.seatNumber ??
                    "Sin asignar"}
                </TableCell>
                <TableCell>
                  {assigned
                    ? "Completado"
                    : passenger.checkedInAt
                      ? formatDate(passenger.checkedInAt)
                      : "Pendiente"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}
