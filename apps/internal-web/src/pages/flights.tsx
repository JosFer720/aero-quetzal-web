import { useEffect, useRef, useState, type SubmitEvent } from "react";
import type {
  InternalAirport,
  InternalFlight,
} from "@aeroquetzal/api-contracts";
import { createFlightRequestSchema } from "@aeroquetzal/api-contracts";
import { Button } from "@aeroquetzal/ui/button";
import { Input } from "@aeroquetzal/ui/input";
import { Field, Select } from "@aeroquetzal/ui/field";
import {
  PageHeading,
  Loading,
  ErrorState,
  EmptyState,
} from "@aeroquetzal/ui/feedback";
import { Alert, AlertTitle } from "@aeroquetzal/ui/alert";
import { Badge } from "@aeroquetzal/ui/badge";
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
import { useResource } from "../use-resource";

function FlightEditor({
  flight,
  airports,
  onSaved,
  onClose,
}: {
  flight: InternalFlight | null;
  airports: InternalAirport[];
  onSaved: (message: string) => void;
  onClose: () => void;
}) {
  const { api } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const firstInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstInput.current?.focus();
  }, []);
  const selectable = airports.filter(
    (airport) =>
      airport.active ||
      airport.code === flight?.origin ||
      airport.code === flight?.destination,
  );

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const body = createFlightRequestSchema.parse({
        flightNumber: data.get("flightNumber"),
        origin: data.get("origin"),
        destination: data.get("destination"),
        durationMinutes: Number(data.get("durationMinutes")),
        active: data.get("active") === "on",
      });
      const saved = flight
        ? await api.updateFlight(flight.id, body)
        : await api.createFlight(body);
      onSaved(
        "Vuelo " + saved.flightNumber + (flight ? " actualizado." : " creado."),
      );
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="mb-7 border-2 bg-card p-5 shadow-md"
      aria-label={flight ? "Editar vuelo" : "Nuevo vuelo"}
    >
      <h2 className="mb-5 text-lg">
        {flight ? "Editar " + flight.flightNumber : "Nuevo vuelo"}
      </h2>
      {error ? (
        <div className="mb-5">
          <ErrorState message={error} />
        </div>
      ) : null}
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <fieldset
          disabled={busy}
          className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4"
        >
          <Field label="Número de vuelo" hint="AQ seguido de 3 o 4 dígitos">
            <Input
              ref={firstInput}
              name="flightNumber"
              required
              pattern="[Aa][Qq][0-9]{3,4}"
              maxLength={6}
              defaultValue={flight?.flightNumber}
              placeholder="AQ101"
              className="h-10 uppercase"
            />
          </Field>
          <Field label="Origen">
            <Select name="origin" defaultValue={flight?.origin ?? ""} required>
              <option value="" disabled>
                Selecciona aeropuerto
              </option>
              {selectable.map((airport) => (
                <option key={airport.id} value={airport.code}>
                  {airport.code} · {airport.city}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Destino">
            <Select
              name="destination"
              defaultValue={flight?.destination ?? ""}
              required
            >
              <option value="" disabled>
                Selecciona aeropuerto
              </option>
              {selectable.map((airport) => (
                <option key={airport.id} value={airport.code}>
                  {airport.code} · {airport.city}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Duración (minutos)">
            <Input
              name="durationMinutes"
              type="number"
              min={20}
              max={1440}
              required
              defaultValue={flight?.durationMinutes ?? 60}
              className="h-10"
            />
          </Field>
          <label className="flex items-center gap-3 text-sm font-bold sm:col-span-2">
            <input
              name="active"
              type="checkbox"
              defaultChecked={flight?.active ?? true}
              className="size-4 accent-black"
            />
            Ruta activa
          </label>
          <div className="flex flex-wrap gap-3 sm:col-span-2 xl:col-span-4">
            <Button type="submit" disabled={busy}>
              {busy ? "Guardando…" : "Guardar vuelo"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={busy}
            >
              Cancelar edición
            </Button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}

export function FlightsPage() {
  const { api } = useAuth();
  const { result, reload } = useResource("flights", async (signal) => {
    const [flights, airports] = await Promise.all([
      api.flights(signal),
      api.airports(signal),
    ]);
    return { flights, airports };
  });
  const [editor, setEditor] = useState<InternalFlight | "new" | null>(null);
  const [filter, setFilter] = useState("");
  const [active, setActive] = useState("all");
  const [notice, setNotice] = useState("");

  return (
    <>
      <PageHeading eyebrow="Operaciones / Catálogo" title="Vuelos">
        Administra rutas directas. Desactiva una ruta desde su formulario para
        conservar el historial.
      </PageHeading>
      {notice ? (
        <div className="mb-6">
          <Alert status="success">
            <AlertTitle>{notice}</AlertTitle>
          </Alert>
        </div>
      ) : null}
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="min-w-48 flex-1">
          <Field label="Filtrar vuelos">
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Número, origen o destino"
              className="h-10"
            />
          </Field>
        </div>
        <Field label="Estado de ruta">
          <Select
            value={active}
            onChange={(event) => setActive(event.target.value)}
          >
            <option value="all">Todas</option>
            <option value="active">Activas</option>
            <option value="inactive">Inactivas</option>
          </Select>
        </Field>
        <Button
          onClick={() => {
            setEditor("new");
            setNotice("");
          }}
          disabled={result.status !== "success"}
        >
          Nuevo vuelo
        </Button>
        <Button variant="outline" onClick={reload}>
          Actualizar
        </Button>
      </div>
      {result.status === "loading" ? (
        <Loading />
      ) : result.status === "error" ? (
        <ErrorState message={result.message} onRetry={reload} />
      ) : (
        <>
          {editor ? (
            <FlightEditor
              key={editor === "new" ? "new" : editor.id}
              flight={editor === "new" ? null : editor}
              airports={result.data.airports}
              onClose={() => setEditor(null)}
              onSaved={(message) => {
                setEditor(null);
                setNotice(message);
                reload();
              }}
            />
          ) : null}
          <FlightList
            flights={result.data.flights.filter(
              (flight) =>
                (active === "all" || flight.active === (active === "active")) &&
                [flight.flightNumber, flight.origin, flight.destination]
                  .join(" ")
                  .toLowerCase()
                  .includes(filter.toLowerCase().trim()),
            )}
            onEdit={(flight) => {
              setEditor(flight);
              setNotice("");
            }}
          />
        </>
      )}
    </>
  );
}

function FlightList({
  flights,
  onEdit,
}: {
  flights: InternalFlight[];
  onEdit: (flight: InternalFlight) => void;
}) {
  if (!flights.length)
    return (
      <EmptyState title="Sin vuelos para mostrar">
        Crea un vuelo o ajusta los filtros.
      </EmptyState>
    );
  return (
    <Table aria-label="Catálogo de vuelos">
      <TableHeader>
        <TableRow>
          <TableHead>Vuelo</TableHead>
          <TableHead>Ruta</TableHead>
          <TableHead>Duración</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {flights.map((flight) => (
          <TableRow key={flight.id} className="bg-card">
            <TableCell className="font-head">{flight.flightNumber}</TableCell>
            <TableCell>
              {flight.origin} → {flight.destination}
            </TableCell>
            <TableCell>{flight.durationMinutes} min</TableCell>
            <TableCell>
              <Badge
                variant="outline"
                className={flight.active ? "bg-mint" : "bg-muted"}
              >
                {flight.active ? "Activa" : "Inactiva"}
              </Badge>
            </TableCell>
            <TableCell>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(flight)}
                aria-label={"Editar " + flight.flightNumber}
              >
                Editar
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
