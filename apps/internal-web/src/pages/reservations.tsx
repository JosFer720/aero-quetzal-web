import { useState, type SubmitEvent } from "react";
import { Link } from "react-router-dom";
import {
  internalReservationSearchSchema,
  type InternalReservation,
} from "@aeroquetzal/api-contracts";
import { Button } from "@aeroquetzal/ui/button";
import { Input } from "@aeroquetzal/ui/input";
import { Field } from "@aeroquetzal/ui/field";
import {
  PageHeading,
  Loading,
  ErrorState,
  EmptyState,
} from "@aeroquetzal/ui/feedback";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@aeroquetzal/ui/table";
import { useAuth } from "../auth";
import { errorMessage } from "../api";
import { canAccess } from "../permissions";
import { useResource } from "../use-resource";
import { StatusBadge } from "../components/status";
import { ReservationDetails } from "../components/reservation-details";

export function ReservationsPage() {
  const { api, state } = useAuth();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<InternalReservation | null>(null);
  const [validation, setValidation] = useState("");
  const { result, reload } = useResource("reservations:" + query, (signal) =>
    query ? api.reservations(query, signal) : Promise.resolve([]),
  );
  function search(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const body = internalReservationSearchSchema.parse({
        q: new FormData(event.currentTarget).get("query"),
      });
      setSelected(null);
      setValidation("");
      if (query === body.q) reload();
      else setQuery(body.q);
    } catch (failure) {
      setValidation(errorMessage(failure));
    }
  }
  return (
    <>
      <PageHeading eyebrow="Atención al pasajero" title="Pasajeros y reservas">
        Busca por código de reserva, nombre, apellido o documento. Los datos de
        pasajeros son de uso interno.
      </PageHeading>
      <form
        onSubmit={search}
        className="mb-6 flex flex-wrap items-end gap-4"
        aria-label="Buscar reservas"
      >
        <div className="min-w-48 flex-1">
          <Field label="Código, pasajero o documento">
            <Input
              name="query"
              required
              minLength={2}
              maxLength={120}
              placeholder="AQ7F3K9 o nombre del pasajero"
              className="h-10"
            />
          </Field>
        </div>
        <Button type="submit">Buscar reservas</Button>
      </form>
      {validation ? (
        <div className="mb-6">
          <ErrorState message={validation} />
        </div>
      ) : null}
      {!query ? (
        <EmptyState title="Encuentra una reserva">
          Ingresa al menos dos caracteres para comenzar.
        </EmptyState>
      ) : result.status === "loading" ? (
        <Loading>Buscando reservas…</Loading>
      ) : result.status === "error" ? (
        <ErrorState message={result.message} onRetry={reload} />
      ) : !result.data.length ? (
        <EmptyState title="No se encontraron reservas">
          Revisa el código o busca por otro dato del pasajero.
        </EmptyState>
      ) : (
        <Table aria-label="Resultados de reservas">
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Pasajeros</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data.map((reservation) => (
              <TableRow key={reservation.id} className="bg-card">
                <TableCell className="font-head">{reservation.code}</TableCell>
                <TableCell className="whitespace-normal">
                  {reservation.passengers
                    .map((person) => person.firstName + " " + person.lastName)
                    .join(", ")}
                </TableCell>
                <TableCell>
                  <StatusBadge status={reservation.status} />
                </TableCell>
                <TableCell>
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelected(reservation)}
                      aria-label={"Ver reserva " + reservation.code}
                    >
                      Ver detalle
                    </Button>
                    {reservation.status === "CONFIRMED" &&
                    state.status === "authenticated" &&
                    canAccess(state.session.user.roles, "checkIn") ? (
                      <Button asChild size="sm">
                        <Link to="/check-in" state={{ code: reservation.code }}>
                          Check-In
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {selected ? (
        <>
          <ReservationDetails reservation={selected} />
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setSelected(null)}
          >
            Cerrar detalle
          </Button>
        </>
      ) : null}
    </>
  );
}
