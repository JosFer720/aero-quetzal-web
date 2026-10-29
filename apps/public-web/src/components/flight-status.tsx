import { useState, type FormEvent } from "react";
import { flightNumberSchema } from "@aeroquetzal/api-contracts";
import { Button } from "@aeroquetzal/ui/button";
import { Input } from "@aeroquetzal/ui/input";
import { Field } from "@aeroquetzal/ui/field";
import { ErrorState, Loading } from "@aeroquetzal/ui/feedback";
import type { PublicApi } from "../api";
import { formatDate, flightLabels } from "../format";
import { useResource } from "../use-resource";

export function FlightStatus({ api }: { api: PublicApi }) {
  const [number, setNumber] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const [error, setError] = useState("");
  const resource = useResource(query, (signal) => api.status(query!, signal));
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const parsed = flightNumberSchema.safeParse(number);
    if (!parsed.success) {
      setError("Usa AQ seguido de 3 o 4 números, por ejemplo AQ101.");
      return;
    }
    setQuery(parsed.data);
    resource.reload();
  }
  return (
    <section id="estado" aria-labelledby="status-title" className="space-y-5">
      <h2 id="status-title" className="text-3xl">
        Estado de vuelo
      </h2>
      <form
        onSubmit={submit}
        className="flex flex-wrap items-end gap-4 border-2 bg-card p-5 shadow-md"
      >
        <div className="min-w-0 flex-1">
          <Field label="Número de vuelo">
            <Input
              required
              maxLength={6}
              placeholder="AQ101"
              value={number}
              onChange={(event) => {
                setNumber(event.target.value);
                setQuery(null);
              }}
            />
          </Field>
        </div>
        <Button type="submit" className="min-h-11">
          Consultar estado
        </Button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {resource.result.status === "loading" ? (
        <Loading>Consultando estado…</Loading>
      ) : null}
      {resource.result.status === "error" ? (
        <ErrorState
          message={resource.result.message}
          onRetry={resource.reload}
        />
      ) : null}
      {resource.result.status === "success" ? (
        <div role="status" className="space-y-2 border-2 bg-mint p-5">
          <p className="font-head text-xl">
            {resource.result.data.flightNumber} ·{" "}
            {flightLabels[resource.result.data.status]}
          </p>
          <p>
            Salida: {formatDate(resource.result.data.departureAt)} (Guatemala)
          </p>
          <p className="text-sm">
            Última actualización: {formatDate(resource.result.data.updatedAt)}{" "}
            (Guatemala)
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={resource.reload}
          >
            Actualizar estado
          </Button>
        </div>
      ) : null}
    </section>
  );
}
