import { ArrowUpRight, Plane, TicketCheck } from "lucide-react";
import { Badge } from "@aeroquetzal/ui/badge";
import { Button } from "@aeroquetzal/ui/button";
import { EmptyState, ErrorState, Loading } from "@aeroquetzal/ui/feedback";
import { Marco } from "./components/marco";
import { FlightSearch } from "./components/flight-search";
import { ReservationLookup } from "./components/reservation-lookup";
import { FlightStatus } from "./components/flight-status";
import { publicApi, type PublicApi } from "./api";
import { useResource } from "./use-resource";

export function App({ api = publicApi }: { api?: PublicApi }) {
  const airports = useResource("airports", (signal) => api.airports(signal));
  return (
    <Marco>
      <section className="grid items-center gap-10 md:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Badge className="bg-mint">HECHO PARA EXPLORAR</Badge>
          <h1 className="text-5xl leading-[1.08] sm:text-6xl lg:text-7xl">
            Tu próxima
            <br />
            historia empieza
            <br />
            <span className="bg-primary px-2">en el aire.</span>
          </h1>
          <p className="max-w-xl text-lg">
            Conecta con nuevos destinos. Elige un vuelo directo y confirma tu
            reserva gratuita en pocos pasos.
          </p>
          <Button asChild size="lg">
            <a href="#buscar">
              Encuentra tu vuelo <ArrowUpRight aria-hidden="true" />
            </a>
          </Button>
          <p className="text-xs font-medium">
            Simulación académica. Todas las reservas son gratuitas.
          </p>
        </div>
        <div
          aria-hidden="true"
          className="relative mx-2 rotate-2 border-2 bg-sky p-6 shadow-xl sm:p-8"
        >
          <div className="flex items-center justify-between border-b-2 pb-4">
            <p className="font-head text-sm">AEROQUETZAL</p>
            <Plane className="size-8 -rotate-45" />
          </div>
          <p className="mt-8 font-head text-5xl">
            VAMOS
            <br />
            MÁS LEJOS.
          </p>
          <div className="my-6 flex items-center gap-3">
            <span className="size-3 border-2 bg-primary" />
            <span className="flex-1 border-t-2 border-dashed" />
            <Plane className="size-7" />
          </div>
          <p className="font-head text-sm">TÚ ELIGES EL DESTINO.</p>
          <p className="mt-2 text-sm">Nosotros conectamos la historia.</p>
          <span className="absolute -right-3 -bottom-4 -rotate-6 border-2 bg-coral px-4 py-2 font-head text-sm shadow-md">
            ¡A VOLAR!
          </span>
        </div>
      </section>
      <section id="buscar" aria-labelledby="search-title" className="space-y-6">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-widest">
            01 / Elige tu destino
          </p>
          <h2 id="search-title" className="text-3xl">
            ¿A dónde vamos?
          </h2>
          <p className="mt-3">
            Vuelos directos, un solo trayecto. Horarios en hora de Guatemala
            (UTC−6).
          </p>
        </div>
        {airports.result.status === "loading" ? (
          <Loading>Cargando aeropuertos…</Loading>
        ) : null}
        {airports.result.status === "error" ? (
          <ErrorState
            message={airports.result.message}
            onRetry={airports.reload}
          />
        ) : null}
        {airports.result.status === "success" ? (
          airports.result.data.length < 2 ? (
            <EmptyState title="Aún no hay rutas disponibles">
              Vuelve a consultar más adelante.
            </EmptyState>
          ) : (
            <FlightSearch api={api} airports={airports.result.data} />
          )
        ) : null}
      </section>
      {airports.result.status === "success" &&
      airports.result.data.length > 0 ? (
        <section aria-labelledby="destinations-title" className="space-y-5">
          <h2 id="destinations-title" className="text-2xl">
            Un nuevo lugar, una nueva historia.
          </h2>
          <p>
            Explora nuestro catálogo de aeropuertos. Busca una ruta y fecha para
            comprobar vuelos disponibles.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {airports.result.data.map((airport, index) => (
              <article
                key={airport.code}
                className={`border-2 p-5 shadow-md ${["bg-mint", "bg-sky", "bg-coral"][index % 3]}`}
              >
                <p className="font-head text-3xl">{airport.code}</p>
                <h3 className="mt-2 text-lg">{airport.city}</h3>
                <p className="text-sm">{airport.country}</p>
                <p className="mt-3 text-xs">{airport.name}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <ReservationLookup api={api} />
      <FlightStatus api={api} />
      <section
        id="informacion"
        aria-labelledby="info-title"
        className="space-y-6 border-t-4 pt-8"
      >
        <div className="flex items-center gap-3">
          <TicketCheck aria-hidden="true" className="size-8" />
          <h2 id="info-title" className="text-2xl">
            Antes de despegar
          </h2>
        </div>
        <div className="grid gap-6 text-sm sm:grid-cols-3">
          <div>
            <h3 className="mb-2 text-base">Guarda tu código</h3>
            <p>
              La confirmación aparece en pantalla. Consulta tu reserva con ese
              código y tu documento. Si necesitas ayuda, comunícate con el
              personal de AeroQuetzal.
            </p>
          </div>
          <div>
            <h3 className="mb-2 text-base">Cambios de planes</h3>
            <p>
              Puedes cancelar tu reserva confirmada desde Mi reserva. Se liberan
              los cupos de todos los pasajeros. Después del Check-In ya no se
              puede cancelar.
            </p>
          </div>
          <div>
            <h3 className="mb-2 text-base">El día del viaje</h3>
            <p>
              El personal autorizado realiza el Check-In y el sistema asigna tu
              asiento automáticamente. Aquí puedes consultar el estado de tu
              vuelo.
            </p>
          </div>
        </div>
      </section>
    </Marco>
  );
}
