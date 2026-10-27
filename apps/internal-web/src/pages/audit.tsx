import { useState } from "react";
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
import { useResource } from "../use-resource";
import { formatDate } from "../components/status";

export function AuditPage() {
  const { api } = useAuth();
  const { result, reload } = useResource("audit", (signal) =>
    api.audit(signal),
  );
  const [query, setQuery] = useState("");
  const events =
    result.status === "success"
      ? result.data
          .filter((event) =>
            [event.actor, event.action, event.entityType, event.entityId]
              .join(" ")
              .toLowerCase()
              .includes(query.toLowerCase().trim()),
          )
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      : [];
  return (
    <>
      <PageHeading
        eyebrow="Supervisión / Sólo lectura"
        title="Historial de auditoría"
      >
        Consulta quién realizó cada operación, cuándo ocurrió y qué registro fue
        afectado.
      </PageHeading>
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="min-w-48 flex-1">
          <Field label="Filtrar auditoría">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Actor, acción o entidad"
              className="h-10"
            />
          </Field>
        </div>
        <Button variant="outline" onClick={reload}>
          Actualizar auditoría
        </Button>
      </div>
      {result.status === "loading" ? (
        <Loading />
      ) : result.status === "error" ? (
        <ErrorState message={result.message} onRetry={reload} />
      ) : !events.length ? (
        <EmptyState title="Sin eventos para mostrar">
          No hay operaciones registradas que coincidan con el filtro.
        </EmptyState>
      ) : (
        <Table aria-label="Eventos de auditoría">
          <TableHeader>
            <TableRow>
              <TableHead>Fecha · GT</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead>Entidad</TableHead>
              <TableHead>Detalle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <TableRow key={event.id} className="bg-card">
                <TableCell>{formatDate(event.createdAt)}</TableCell>
                <TableCell className="font-bold">{event.actor}</TableCell>
                <TableCell>{event.action}</TableCell>
                <TableCell>
                  <p>{event.entityType}</p>
                  <p className="max-w-48 break-all whitespace-normal text-xs text-muted-foreground">
                    {event.entityId}
                  </p>
                </TableCell>
                <TableCell>
                  <details className="max-w-sm whitespace-normal">
                    <summary className="cursor-pointer underline">
                      Ver detalle
                    </summary>
                    <pre className="mt-3 max-h-52 overflow-auto border-2 bg-muted p-3 text-xs break-words whitespace-pre-wrap">
                      {JSON.stringify(event.details, null, 2)}
                    </pre>
                  </details>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
