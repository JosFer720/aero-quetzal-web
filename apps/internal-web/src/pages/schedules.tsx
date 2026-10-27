import { useState, type SubmitEvent } from "react";
import {
  createFlightInstanceRequestSchema,
  type InternalAircraft,
  type InternalFlight,
  type InternalFlightInstance,
} from "@aeroquetzal/api-contracts";
import {
  canTransitionFlight,
  FLIGHT_STATUSES,
  type FlightStatus,
} from "@aeroquetzal/domain";
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
import {
  StatusBadge,
  statusLabels,
  formatDate,
  localDate,
  toUtc,
} from "../components/status";

function ScheduleEditor({
  flights,
  aircraft,
  onSaved,
  onClose,
}: {
  flights: InternalFlight[];
  aircraft: InternalAircraft[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const { api } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [aircraftId, setAircraftId] = useState("");
  const capacity =
    aircraft.find((item) => item.id === aircraftId)?.capacity ?? 600;
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const body = createFlightInstanceRequestSchema.parse({
        flightId: data.get("flightId"),
        aircraftId: data.get("aircraftId"),
        capacity: Number(data.get("capacity")),
        departureAt: toUtc(String(data.get("departureAt"))),
        arrivalAt: toUtc(String(data.get("arrivalAt"))),
      });
      if (body.capacity > capacity) {
        setError("La capacidad supera los asientos de la aeronave.");
        return;
      }
      await api.createInstance(body);
      onSaved();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="mb-7 border-2 bg-card p-5 shadow-md"
      aria-label="Nuevo horario"
    >
      <h2 className="mb-2 text-lg">Programar salida</h2>
      <p className="mb-5 text-sm text-muted-foreground">
        Todas las fechas y horas se ingresan en hora de Guatemala (UTC−06:00).
      </p>
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
          className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
        >
          <Field label="Vuelo">
            <Select name="flightId" defaultValue="" required>
              <option value="" disabled>
                Selecciona vuelo
              </option>
              {flights
                .filter((item) => item.active)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.flightNumber} · {item.origin} → {item.destination}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Aeronave">
            <Select
              name="aircraftId"
              required
              value={aircraftId}
              onChange={(event) => setAircraftId(event.target.value)}
            >
              <option value="" disabled>
                Selecciona aeronave
              </option>
              {aircraft
                .filter((item) => item.active)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.registration} · {item.model} ({item.capacity})
                  </option>
                ))}
            </Select>
          </Field>
          <Field
            label="Capacidad"
            hint={
              aircraftId
                ? "Máximo " + capacity + " asientos"
                : "Selecciona una aeronave"
            }
          >
            <Input
              key={aircraftId}
              name="capacity"
              type="number"
              min={1}
              max={capacity}
              defaultValue={aircraftId ? capacity : ""}
              required
              className="h-10"
            />
          </Field>
          <Field label="Salida (Guatemala)">
            <Input
              name="departureAt"
              type="datetime-local"
              required
              className="h-10"
            />
          </Field>
          <Field label="Llegada (Guatemala)">
            <Input
              name="arrivalAt"
              type="datetime-local"
              required
              className="h-10"
            />
          </Field>
          <div className="flex flex-wrap gap-3 sm:col-span-2 xl:col-span-3">
            <Button type="submit" disabled={busy}>
              {busy ? "Programando…" : "Guardar horario"}
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

function StatusEditor({
  instance,
  onSaved,
}: {
  instance: InternalFlightInstance;
  onSaved: () => void;
}) {
  const { api } = useAuth();
  const nextStates = FLIGHT_STATUSES.filter((status) =>
    canTransitionFlight(instance.status, status),
  );
  const [next, setNext] = useState<FlightStatus | "">(nextStates[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!nextStates.length)
    return <span className="text-xs text-muted-foreground">Estado final</span>;
  async function changeStatus() {
    if (!next || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.updateStatus(instance.id, { status: next });
      onSaved();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid min-w-52 gap-3">
      <div className="flex items-center gap-2">
        <Select
          aria-label={"Nuevo estado de " + instance.flightNumber}
          value={next}
          disabled={busy}
          onChange={(event) => setNext(event.target.value as FlightStatus)}
        >
          {nextStates.map((status) => (
            <option key={status} value={status}>
              {statusLabels[status]}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          variant={next === "CANCELLED" ? "destructive" : "outline"}
          disabled={busy}
          onClick={() => {
            void changeStatus();
          }}
        >
          {busy ? "Guardando…" : "Aplicar"}
        </Button>
      </div>
      {error ? (
        <p
          role="alert"
          className="max-w-xs whitespace-normal text-sm text-red-900"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function InstanceFilters({
  filter,
  date,
  setFilter,
  setDate,
  reload,
}: {
  filter: string;
  date: string;
  setFilter: (value: string) => void;
  setDate: (value: string) => void;
  reload: () => void;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-4">
      <div className="min-w-48 flex-1">
        <Field label="Filtrar salidas">
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Vuelo o aeropuerto"
            className="h-10"
          />
        </Field>
      </div>
      <Field label="Fecha de salida (Guatemala)">
        <Input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="h-10"
        />
      </Field>
      <Button
        variant="outline"
        onClick={() => {
          setFilter("");
          setDate("");
        }}
      >
        Limpiar filtros
      </Button>
      <Button variant="outline" onClick={reload}>
        Actualizar
      </Button>
    </div>
  );
}

function filterInstances(
  items: InternalFlightInstance[],
  filter: string,
  date: string,
) {
  return items
    .filter(
      (item) =>
        (!date || localDate(item.departureAt) === date) &&
        [item.flightNumber, item.origin, item.destination]
          .join(" ")
          .toLowerCase()
          .includes(filter.toLowerCase().trim()),
    )
    .sort((a, b) => Date.parse(a.departureAt) - Date.parse(b.departureAt));
}

export function SchedulesPage() {
  const { api } = useAuth();
  const { result, reload } = useResource("schedules", async (signal) => {
    const [instances, flights, aircraft] = await Promise.all([
      api.instances(signal),
      api.flights(signal),
      api.aircraft(signal),
    ]);
    return { instances, flights, aircraft };
  });
  const [editor, setEditor] = useState<{
    flights: InternalFlight[];
    aircraft: InternalAircraft[];
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("");
  const [date, setDate] = useState("");
  const instances =
    result.status === "success"
      ? filterInstances(result.data.instances, filter, date)
      : [];
  return (
    <>
      <PageHeading
        eyebrow="Operaciones / Programación"
        title="Horarios y estados"
      >
        Programa salidas y avanza cada vuelo por sus estados operativos. Cancela
        únicamente vuelos programados.
      </PageHeading>
      {notice ? (
        <div className="mb-6">
          <Alert status="success">
            <AlertTitle>{notice}</AlertTitle>
          </Alert>
        </div>
      ) : null}
      <div className="mb-5">
        <Button
          disabled={result.status !== "success"}
          onClick={() => {
            if (result.status !== "success") return;
            setEditor({
              flights: result.data.flights,
              aircraft: result.data.aircraft,
            });
            setNotice("");
          }}
        >
          Programar salida
        </Button>
      </div>
      <InstanceFilters {...{ filter, date, setFilter, setDate, reload }} />
      {editor ? (
        <ScheduleEditor
          flights={editor.flights}
          aircraft={editor.aircraft}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setNotice("Horario creado.");
            reload();
          }}
        />
      ) : null}
      {result.status === "loading" ? (
        <Loading />
      ) : result.status === "error" ? (
        <ErrorState message={result.message} onRetry={reload} />
      ) : (
        <>
          {!instances.length ? (
            <EmptyState title="Sin salidas para mostrar">
              Programa una salida o ajusta los filtros.
            </EmptyState>
          ) : (
            <Table aria-label="Horarios de vuelos">
              <TableHeader>
                <TableRow>
                  <TableHead>Vuelo / Ruta</TableHead>
                  <TableHead>Salida / Llegada · GT</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Actualizar estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {instances.map((item) => (
                  <TableRow key={item.id} className="bg-card">
                    <TableCell>
                      <p className="font-head">{item.flightNumber}</p>
                      <p className="mt-1">
                        {item.origin} → {item.destination}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p>{formatDate(item.departureAt)}</p>
                      <p className="mt-1 text-muted-foreground">
                        {formatDate(item.arrivalAt)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell>
                      <StatusEditor
                        key={item.id + item.status}
                        instance={item}
                        onSaved={() => {
                          setNotice("Estado del vuelo actualizado.");
                          reload();
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}
    </>
  );
}

export function AvailabilityPage() {
  const { api } = useAuth();
  const { result, reload } = useResource("availability", (signal) =>
    api.instances(signal),
  );
  const [filter, setFilter] = useState("");
  const [date, setDate] = useState("");
  const instances =
    result.status === "success"
      ? filterInstances(result.data, filter, date)
      : [];
  return (
    <>
      <PageHeading
        eyebrow="Operaciones / Inventario"
        title="Disponibilidad por vuelo"
      >
        Consulta capacidad, reservas y cupos restantes. Los asientos se asignan
        automáticamente durante el Check-In.
      </PageHeading>
      <InstanceFilters {...{ filter, date, setFilter, setDate, reload }} />
      {result.status === "loading" ? (
        <Loading />
      ) : result.status === "error" ? (
        <ErrorState message={result.message} onRetry={reload} />
      ) : !instances.length ? (
        <EmptyState title="Sin vuelos para mostrar">
          Ajusta los filtros o programa una salida.
        </EmptyState>
      ) : (
        <Table aria-label="Disponibilidad de vuelos">
          <TableHeader>
            <TableRow>
              <TableHead>Vuelo / Ruta</TableHead>
              <TableHead>Salida · GT</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Capacidad</TableHead>
              <TableHead>Reservados</TableHead>
              <TableHead>Disponibles</TableHead>
              <TableHead>Ocupación</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {instances.map((item) => (
              <TableRow key={item.id} className="bg-card">
                <TableCell>
                  <p className="font-head">{item.flightNumber}</p>
                  <p>
                    {item.origin} → {item.destination}
                  </p>
                </TableCell>
                <TableCell>{formatDate(item.departureAt)}</TableCell>
                <TableCell>
                  <StatusBadge status={item.status} />
                </TableCell>
                <TableCell>{item.capacity}</TableCell>
                <TableCell>{item.reservedSeats}</TableCell>
                <TableCell className="font-bold">
                  {item.status === "CANCELLED"
                    ? "No reservable"
                    : item.availableSeats}
                </TableCell>
                <TableCell>
                  <meter
                    aria-label={"Ocupación de " + item.flightNumber}
                    min={0}
                    max={item.capacity}
                    value={item.reservedSeats}
                    className="w-24"
                  />
                  <span className="ml-2">
                    {Math.round((item.reservedSeats / item.capacity) * 100)}%
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
