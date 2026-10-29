import { useState, type FormEvent } from "react";
import {
  flightSearchQuerySchema,
  type AirportResponse,
  type FlightSearchQuery,
  type PublicFlight,
  type CreateReservationResponse,
} from "@aeroquetzal/api-contracts";
import { Button } from "@aeroquetzal/ui/button";
import { Input } from "@aeroquetzal/ui/input";
import { Badge } from "@aeroquetzal/ui/badge";
import { Field, Select } from "@aeroquetzal/ui/field";
import { EmptyState, ErrorState, Loading } from "@aeroquetzal/ui/feedback";
import { type PublicApi } from "../api";
import { flightLabels, formatDate, today } from "../format";
import { useResource } from "../use-resource";
import { Booking } from "./booking";

export function FlightSearch({
  api,
  airports,
}: {
  api: PublicApi;
  airports: AirportResponse[];
}) {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState(today);
  const [searchAt, setSearchAt] = useState(Date.now);
  const [query, setQuery] = useState<FlightSearchQuery | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<PublicFlight | null>(null);
  const [confirmation, setConfirmation] =
    useState<CreateReservationResponse | null>(null);
  const flights = useResource(query ? JSON.stringify(query) : null, (signal) =>
    api.flights(query!, signal),
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const parsed = flightSearchQuerySchema.safeParse({
      origin,
      destination,
      date,
    });
    if (!parsed.success || date < today()) {
      setError("Elige aeropuertos diferentes y una fecha de hoy o posterior.");
      return;
    }
    setSelected(null);
    setConfirmation(null);
    setSearchAt(Date.now());
    setQuery(parsed.data);
    flights.reload();
  }

  return (
    <div className="space-y-7">
      <form
        onSubmit={submit}
        className="grid gap-5 border-2 bg-primary p-5 shadow-lg sm:grid-cols-2 sm:p-7 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end"
      >
        <Field label="Origen">
          <Select
            required
            disabled={selected !== null}
            value={origin}
            onChange={(event) => setOrigin(event.target.value)}
          >
            <option value="">¿De dónde sales?</option>
            {airports.map((airport) => (
              <option key={airport.code} value={airport.code}>
                {airport.city} ({airport.code})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Destino">
          <Select
            required
            disabled={selected !== null}
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
          >
            <option value="">¿A dónde vamos?</option>
            {airports.map((airport) => (
              <option key={airport.code} value={airport.code}>
                {airport.city} ({airport.code})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fecha de salida">
          <Input
            required
            disabled={selected !== null}
            type="date"
            min={today()}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
        <Button
          type="submit"
          variant="secondary"
          className="min-h-11"
          disabled={airports.length < 2 || selected !== null}
        >
          Buscar vuelos
        </Button>
        {error ? (
          <p role="alert" className="font-bold sm:col-span-2 lg:col-span-4">
            {error}
          </p>
        ) : null}
      </form>
      {flights.result.status === "loading" ? (
        <Loading>Buscando vuelos disponibles…</Loading>
      ) : null}
      {flights.result.status === "error" ? (
        <ErrorState message={flights.result.message} onRetry={flights.reload} />
      ) : null}
      {confirmation ? (
        <section
          aria-labelledby="confirmation-title"
          className="space-y-5 border-2 bg-mint p-6 shadow-lg"
          role="status"
        >
          <p className="text-xs font-bold uppercase tracking-widest">
            03 / Listo para viajar
          </p>
          <h3 id="confirmation-title" className="text-2xl">
            {confirmation.message}
          </h3>
          <p>Tu código de reserva</p>
          <p className="break-all font-head text-4xl tracking-wider sm:text-5xl">
            {confirmation.code}
          </p>
          <p>
            Guarda este código. Para consultar o cancelar usa{" "}
            <a className="font-bold underline" href="#mi-reserva">
              Mi reserva
            </a>{" "}
            con el documento de uno de los pasajeros. No recibirás un correo de
            confirmación.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setConfirmation(null);
              flights.reload();
            }}
          >
            Buscar otro vuelo
          </Button>
        </section>
      ) : selected ? (
        <Booking
          key={selected.id}
          api={api}
          flight={selected}
          onClose={() => {
            setSelected(null);
            flights.reload();
          }}
          onConfirmed={(value) => {
            setConfirmation(value);
            setSelected(null);
          }}
        />
      ) : flights.result.status === "success" ? (
        <section aria-labelledby="results-title" className="space-y-4">
          <div className="flex flex-wrap justify-between gap-2">
            <h3 id="results-title" className="text-xl">
              Vuelos encontrados
            </h3>
            <p className="text-sm">
              Todos los horarios en hora de Guatemala (UTC−6).
            </p>
          </div>
          {flights.result.data.length === 0 ? (
            <EmptyState title="No hay vuelos para esta búsqueda">
              Prueba otra fecha o una ruta diferente.
            </EmptyState>
          ) : (
            flights.result.data.map((flight) => (
              <article
                key={flight.id}
                className="grid gap-5 border-2 bg-card p-5 shadow-md sm:grid-cols-[1fr_auto]"
                aria-label={`Vuelo ${flight.flightNumber}`}
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <h4 className="font-head text-lg">
                      {flight.flightNumber} · {flight.origin.code} →{" "}
                      {flight.destination.code}
                    </h4>
                    <Badge className="bg-sky">
                      {flightLabels[flight.status]}
                    </Badge>
                  </div>
                  <p>
                    {flight.origin.city} → {flight.destination.city}
                  </p>
                  <p className="text-sm">
                    Salida: {formatDate(flight.departureAt)}
                    <br />
                    Llegada: {formatDate(flight.arrivalAt)}
                  </p>
                </div>
                <div className="flex flex-col items-start justify-center gap-3 sm:items-end">
                  <p className="font-bold">
                    {flight.availableSeats} cupos disponibles
                  </p>
                  <Button
                    type="button"
                    disabled={
                      flight.availableSeats === 0 ||
                      flight.status !== "SCHEDULED" ||
                      Date.parse(flight.departureAt) <= searchAt
                    }
                    onClick={() => setSelected(flight)}
                  >
                    {flight.availableSeats === 0
                      ? "Sin cupos"
                      : flight.status !== "SCHEDULED" ||
                          Date.parse(flight.departureAt) <= searchAt
                        ? "Reserva no disponible"
                        : "Elegir vuelo"}
                  </Button>
                </div>
              </article>
            ))
          )}
        </section>
      ) : null}
    </div>
  );
}
