import { useRef, useState, type FormEvent } from "react";
import {
  createReservationRequestSchema,
  type PublicFlight,
  type CreateReservationResponse,
} from "@aeroquetzal/api-contracts";
import { Button } from "@aeroquetzal/ui/button";
import { Input } from "@aeroquetzal/ui/input";
import { Field, Select } from "@aeroquetzal/ui/field";
import { ErrorState, Loading } from "@aeroquetzal/ui/feedback";
import { errorMessage, type PublicApi } from "../api";
import { formatDate } from "../format";
import { useResource } from "../use-resource";

const blankPassenger = () => ({
  firstName: "",
  lastName: "",
  documentNumber: "",
});

export function Booking({
  api,
  flight,
  onClose,
  onConfirmed,
}: {
  api: PublicApi;
  flight: PublicFlight;
  onClose: () => void;
  onConfirmed: (value: CreateReservationResponse) => void;
}) {
  const availability = useResource(flight.id, (signal) =>
    api.availability(flight.id, signal),
  );
  const [passengers, setPassengers] = useState([blankPassenger()]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  const available =
    availability.result.status === "success" &&
    availability.result.data.flightInstanceId === flight.id
      ? availability.result.data.availableSeats
      : null;

  function updatePassenger(
    index: number,
    field: keyof ReturnType<typeof blankPassenger>,
    value: string,
  ) {
    setPassengers((items) =>
      items.map((passenger, i) =>
        i === index ? { ...passenger, [field]: value } : passenger,
      ),
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    setError("");
    const parsed = createReservationRequestSchema.safeParse({
      flightInstanceId: flight.id,
      passengers,
      contactEmail: email.trim(),
    });
    if (!parsed.success) {
      setError(
        "Revisa los nombres, apellidos, correo y documentos. El documento debe tener entre 5 y 24 letras, números o guiones.",
      );
      return;
    }
    if (
      new Set(parsed.data.passengers.map((item) => item.documentNumber))
        .size !== passengers.length
    ) {
      setError("Cada pasajero debe tener un documento diferente.");
      return;
    }
    if (available === null || available < passengers.length) {
      setError(
        "No hay suficientes cupos para todos los pasajeros. Actualiza la disponibilidad.",
      );
      return;
    }
    sending.current = true;
    setPending(true);
    try {
      onConfirmed(await api.reserve(parsed.data));
    } catch (failure) {
      setError(errorMessage(failure));
      availability.reload();
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby="booking-title"
      className="space-y-5 border-2 bg-card p-5 shadow-lg sm:p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-widest">
            02 / Tus pasajeros
          </p>
          <h3 id="booking-title" className="text-2xl">
            Reserva tu próximo vuelo
          </h3>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onClose}
        >
          Cambiar vuelo
        </Button>
      </div>
      <p>
        {flight.flightNumber} · {flight.origin.code} → {flight.destination.code}{" "}
        · {formatDate(flight.departureAt)} (Guatemala)
      </p>
      {availability.result.status === "loading" ? (
        <Loading>Verificando cupos…</Loading>
      ) : null}
      {availability.result.status === "error" ? (
        <ErrorState
          message={availability.result.message}
          onRetry={availability.reload}
        />
      ) : null}
      {available !== null ? (
        <div className="flex flex-wrap items-center gap-4 bg-mint p-3">
          <p aria-live="polite">
            <strong>{available}</strong> cupos disponibles
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={availability.reload}
          >
            Actualizar cupos
          </Button>
        </div>
      ) : null}
      <form onSubmit={submit} className="space-y-5">
        <fieldset disabled={pending} className="min-w-0 space-y-5">
          <legend className="sr-only">Datos de los pasajeros</legend>
          <Field
            label="Cantidad de pasajeros"
            hint="De 1 a 9 pasajeros por reserva."
          >
            <Select
              value={passengers.length}
              onChange={(event) => {
                const count = Number(event.target.value);
                setPassengers((items) =>
                  Array.from(
                    { length: count },
                    (_, index) => items[index] ?? blankPassenger(),
                  ),
                );
              }}
            >
              {Array.from({ length: 9 }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  {index + 1}
                </option>
              ))}
            </Select>
          </Field>
          {passengers.map((passenger, index) => (
            <fieldset
              key={index}
              className="grid min-w-0 gap-4 border-2 p-4 sm:grid-cols-3"
            >
              <legend className="px-2 font-bold">Pasajero {index + 1}</legend>
              <Field label="Nombres">
                <Input
                  autoComplete="given-name"
                  required
                  maxLength={80}
                  value={passenger.firstName}
                  onChange={(event) =>
                    updatePassenger(index, "firstName", event.target.value)
                  }
                />
              </Field>
              <Field label="Apellidos">
                <Input
                  autoComplete="family-name"
                  required
                  maxLength={80}
                  value={passenger.lastName}
                  onChange={(event) =>
                    updatePassenger(index, "lastName", event.target.value)
                  }
                />
              </Field>
              <Field
                label="Número de documento"
                hint="5–24 letras, números o guiones."
              >
                <Input
                  required
                  minLength={5}
                  maxLength={24}
                  pattern="[A-Za-z0-9-]{5,24}"
                  autoComplete="off"
                  value={passenger.documentNumber}
                  onChange={(event) =>
                    updatePassenger(index, "documentNumber", event.target.value)
                  }
                />
              </Field>
            </fieldset>
          ))}
          <Field
            label="Correo de contacto"
            hint="Se guarda como contacto de la reserva. La confirmación se muestra sólo aquí; no se envían correos."
          >
            <Input
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <p className="text-sm">
            Tu reserva es gratuita y queda confirmada al completarla. Guarda el
            código que aparecerá en pantalla. El asiento se asigna durante el
            Check-In.
          </p>
          {available !== null && available < passengers.length ? (
            <p role="status" className="font-bold">
              No hay suficientes cupos para esta cantidad de pasajeros.
            </p>
          ) : null}
          <Button
            size="lg"
            type="submit"
            disabled={available === null || available < passengers.length}
          >
            {pending ? "Confirmando…" : "Confirmar reserva gratuita"}
          </Button>
        </fieldset>
        {error ? <ErrorState message={error} /> : null}
      </form>
    </section>
  );
}
