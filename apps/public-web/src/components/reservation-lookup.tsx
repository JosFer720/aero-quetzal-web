import { useRef, useState, type FormEvent } from "react";
import {
  reservationCodeSchema,
  reservationLookupQuerySchema,
  type PublicReservation,
} from "@aeroquetzal/api-contracts";
import { Button } from "@aeroquetzal/ui/button";
import { Input } from "@aeroquetzal/ui/input";
import { Field } from "@aeroquetzal/ui/field";
import { Badge } from "@aeroquetzal/ui/badge";
import { ErrorState, Loading } from "@aeroquetzal/ui/feedback";
import { errorMessage, type PublicApi } from "../api";
import { formatDate, reservationLabels } from "../format";
import { useResource } from "../use-resource";

function ReservationSummary({
  api,
  reservation,
  documentNumber,
  onUpdated,
}: {
  api: PublicApi;
  reservation: PublicReservation;
  documentNumber: string;
  onUpdated: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const sending = useRef(false);
  async function cancel() {
    if (sending.current) return;
    sending.current = true;
    setPending(true);
    setError("");
    try {
      await api.cancel(reservation.code, documentNumber);
      onUpdated();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      sending.current = false;
      setPending(false);
    }
  }
  return (
    <article
      className="space-y-5 border-2 bg-card p-5 shadow-md"
      aria-label="Resumen de reserva"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="break-all text-2xl">{reservation.code}</h3>
        <Badge className="bg-mint">
          {reservationLabels[reservation.status]}
        </Badge>
      </div>
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="font-bold">Vuelo</dt>
          <dd>{reservation.flightNumber}</dd>
        </div>
        <div>
          <dt className="font-bold">Ruta</dt>
          <dd>
            {reservation.origin} → {reservation.destination}
          </dd>
        </div>
        <div>
          <dt className="font-bold">Salida (Guatemala)</dt>
          <dd>{formatDate(reservation.departureAt)}</dd>
        </div>
        <div>
          <dt className="font-bold">Pasajeros</dt>
          <dd>{reservation.passengerCount}</dd>
        </div>
      </dl>
      {reservation.status === "CONFIRMED" ? (
        confirm ? (
          <div
            role="group"
            aria-label="Confirmar cancelación"
            className="space-y-4 border-2 bg-coral p-4"
          >
            <p>
              ¿Cancelar esta reserva? Se liberarán los cupos de todos sus
              pasajeros.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={() => void cancel()}
              >
                {pending ? "Cancelando…" : "Sí, cancelar reserva"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setConfirm(false)}
              >
                Conservar reserva
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirm(true)}
          >
            Cancelar reserva
          </Button>
        )
      ) : (
        <p className="text-sm">
          {reservation.status === "CHECKED_IN"
            ? "Esta reserva ya completó el Check-In y no puede cancelarse."
            : "Esta reserva fue cancelada y sus cupos se liberaron."}
        </p>
      )}
      {error ? (
        <>
          <ErrorState message={error} />
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onUpdated}
          >
            Actualizar reserva
          </Button>
        </>
      ) : null}
    </article>
  );
}

export function ReservationLookup({ api }: { api: PublicApi }) {
  const [code, setCode] = useState("");
  const [documentNumber, setDocument] = useState("");
  const [query, setQuery] = useState<{
    code: string;
    documentNumber: string;
  } | null>(null);
  const [error, setError] = useState("");
  const reservation = useResource(
    query ? JSON.stringify(query) : null,
    (signal) => api.reservation(query!.code, query!.documentNumber, signal),
  );
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const parsedCode = reservationCodeSchema.safeParse(code);
    const parsedDocument = reservationLookupQuerySchema.safeParse({
      documentNumber,
    });
    if (!parsedCode.success || !parsedDocument.success) {
      setError(
        "Ingresa un código AQ de 7 caracteres y el documento de un pasajero (5–24 letras, números o guiones).",
      );
      return;
    }
    setQuery({
      code: parsedCode.data,
      documentNumber: parsedDocument.data.documentNumber,
    });
    reservation.reload();
  }
  return (
    <section
      id="mi-reserva"
      aria-labelledby="lookup-title"
      className="space-y-5"
    >
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-widest">
          Tu viaje, a mano
        </p>
        <h2 id="lookup-title" className="text-3xl">
          Consulta tu reserva
        </h2>
        <p className="mt-3">
          Usa el código y el documento de uno de los pasajeros. Puedes cancelar
          antes del Check-In.
        </p>
      </div>
      <form
        onSubmit={submit}
        className="grid gap-4 border-2 bg-sky p-5 shadow-md sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      >
        <Field label="Código de reserva">
          <Input
            required
            maxLength={7}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="AQ7F3K9"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setQuery(null);
            }}
          />
        </Field>
        <Field label="Documento de verificación">
          <Input
            required
            maxLength={24}
            autoComplete="off"
            value={documentNumber}
            onChange={(event) => {
              setDocument(event.target.value);
              setQuery(null);
            }}
          />
        </Field>
        <Button type="submit" variant="secondary" className="min-h-11">
          Consultar reserva
        </Button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {reservation.result.status === "loading" ? (
        <Loading>Consultando tu reserva…</Loading>
      ) : null}
      {reservation.result.status === "error" ? (
        <ErrorState
          message={reservation.result.message}
          onRetry={reservation.reload}
        />
      ) : null}
      {query && reservation.result.status === "success" ? (
        <ReservationSummary
          key={JSON.stringify(query)}
          api={api}
          reservation={reservation.result.data}
          documentNumber={query.documentNumber}
          onUpdated={reservation.reload}
        />
      ) : null}
    </section>
  );
}
