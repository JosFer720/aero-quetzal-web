import { Link } from "react-router-dom";
import { Button } from "@aeroquetzal/ui/button";
import { Card, CardContent } from "@aeroquetzal/ui/card";
import { PageHeading, Loading, ErrorState } from "@aeroquetzal/ui/feedback";
import { useAuth } from "../auth";
import { canAccess } from "../permissions";
import { useResource } from "../use-resource";

export function DashboardPage() {
  const { api, state } = useAuth();
  const { result, reload } = useResource("dashboard", (signal) =>
    api.dashboard(signal),
  );
  return (
    <>
      <PageHeading eyebrow="Operación en tiempo real" title="Panel operacional">
        Un vistazo a los vuelos, las reservas y el avance del Check-In.
      </PageHeading>
      <div className="mb-6 flex flex-wrap gap-3">
        <Button variant="outline" size="sm" onClick={reload}>
          Actualizar panel
        </Button>
        {state.status === "authenticated" &&
        canAccess(state.session.user.roles, "checkIn") ? (
          <Button asChild size="sm">
            <Link to="/check-in">Ir a Check-In</Link>
          </Button>
        ) : null}
      </div>
      {result.status === "loading" ? (
        <Loading />
      ) : result.status === "error" ? (
        <ErrorState message={result.message} onRetry={reload} />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Vuelos programados",
              value: result.data.scheduledFlights,
              color: "bg-primary",
            },
            {
              label: "En abordaje",
              value: result.data.boardingFlights,
              color: "bg-sky",
            },
            {
              label: "Reservas confirmadas",
              value: result.data.confirmedReservations,
              color: "bg-card",
            },
            {
              label: "Pasajeros con Check-In",
              value: result.data.checkedInPassengers,
              color: "bg-mint",
            },
          ].map((metric) => (
            <Card key={metric.label} className={metric.color}>
              <CardContent>
                <p className="mb-5 text-sm font-bold">{metric.label}</p>
                <p className="font-head text-4xl tabular-nums">
                  {metric.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <section className="mt-8 border-2 bg-card p-6 shadow-md">
        <h2 className="text-lg">Cada salida comienza aquí</h2>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Consulta tus módulos en el menú. Las acciones disponibles corresponden
          a los roles asignados a tu cuenta.
        </p>
      </section>
    </>
  );
}
