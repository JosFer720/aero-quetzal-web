import { useRef, useState, type SubmitEvent } from "react";
import { useLocation } from "react-router-dom";
import {
  reservationCodeSchema,
  type CheckInResponse,
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
import { Alert, AlertDescription, AlertTitle } from "@aeroquetzal/ui/alert";
import { useAuth } from "../auth";
import { errorMessage } from "../api";
import { useResource } from "../use-resource";
import { ReservationDetails } from "../components/reservation-details";

export function CheckInPage() {
  const { api } = useAuth();
  const location = useLocation();
  const initial = reservationCodeSchema.safeParse(location.state?.code);
  const [code, setCode] = useState(initial.success ? initial.data : "");
  const [validation, setValidation] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [completed, setCompleted] = useState<CheckInResponse | null>(null);
  const { result, reload } = useResource("check-in:" + code, (signal) =>
    code ? api.reservation(code, signal) : Promise.resolve(null),
  );

  function lookup(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    try {
      const value = reservationCodeSchema.parse(
        new FormData(event.currentTarget).get("code"),
      );
      setValidation("");
      setCompleted(null);
      if (value === code) reload();
      else setCode(value);
    } catch {
      setValidation(
        "Usa el código AQ seguido de 5 letras o números, por ejemplo AQ7F3K9.",
      );
    }
  }
  async function checkIn() {
    if (
      inFlight.current ||
      result.status !== "success" ||
      result.data?.status !== "CONFIRMED"
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setValidation("");
    try {
      const response = await api.checkIn(code);
      setCompleted(response);
    } catch (failure) {
      setValidation(errorMessage(failure));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading eyebrow="Atención al pasajero / Embarque" title="Check-In">
        Verifica los pasajeros y confirma su Check-In. El sistema asignará
        automáticamente el primer asiento disponible.
      </PageHeading>
      <form
        onSubmit={lookup}
        aria-label="Buscar reserva para Check-In"
        className="mb-6"
      >
        <fieldset disabled={busy} className="flex flex-wrap items-end gap-4">
          <div className="min-w-48 flex-1">
            <Field label="Código de reserva">
              <Input
                name="code"
                required
                maxLength={7}
                defaultValue={code}
                placeholder="AQ7F3K9"
                className="h-10 uppercase"
                autoComplete="off"
              />
            </Field>
          </div>
          <Button type="submit">Consultar reserva</Button>
        </fieldset>
      </form>
      {validation ? (
        <div className="mb-6">
          <ErrorState message={validation} />
        </div>
      ) : null}
      {!code ? (
        <EmptyState title="Preparados para abordar">
          Consulta una reserva para verificar los pasajeros.
        </EmptyState>
      ) : result.status === "loading" ? (
        <Loading>Consultando reserva…</Loading>
      ) : result.status === "error" ? (
        <ErrorState message={result.message} onRetry={reload} />
      ) : result.data ? (
        <>
          {completed ? (
            <Alert status="success">
              <AlertTitle>Check-In completado</AlertTitle>
              <AlertDescription>
                Asientos asignados para la reserva {completed.reservationCode}.
                No se permite cancelar después del Check-In.
              </AlertDescription>
            </Alert>
          ) : null}
          <ReservationDetails reservation={result.data} completed={completed} />
          <div className="mt-6">
            {completed || result.data.status === "CHECKED_IN" ? (
              <p
                role="status"
                className="border-2 bg-mint p-4 text-sm font-bold"
              >
                Esta reserva ya tiene Check-In. No se generan asignaciones
                duplicadas.
              </p>
            ) : result.data.status === "CANCELLED" ? (
              <Alert status="warning">
                <AlertTitle>Reserva cancelada</AlertTitle>
                <AlertDescription>
                  No se puede realizar Check-In para una reserva cancelada.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="border-2 bg-primary p-5 shadow-md">
                <h2 className="text-lg">Confirmar pasajeros</h2>
                <p className="my-3 text-sm">
                  Se completará el Check-In de los{" "}
                  {result.data.passengers.length} pasajeros de esta reserva.
                  Revisa sus documentos antes de continuar.
                </p>
                <Button
                  onClick={() => {
                    void checkIn();
                  }}
                  disabled={busy || !result.data.passengers.length}
                  variant="secondary"
                >
                  {busy
                    ? "Asignando asientos…"
                    : "Confirmar Check-In y asignar asientos"}
                </Button>
              </div>
            )}
          </div>
        </>
      ) : null}
    </>
  );
}
