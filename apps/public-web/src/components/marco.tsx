import type { ReactNode } from "react";
import { Plane } from "lucide-react";

export function Marco({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <a href="#contenido" className="skip-link">
        Saltar al contenido
      </a>
      <header className="border-b-4 bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-5 py-5 sm:px-8">
          <a
            href="/"
            aria-label="AeroQuetzal, inicio"
            className="flex items-center gap-3"
          >
            <span className="grid size-11 place-items-center border-2 bg-primary shadow-md">
              <Plane aria-hidden="true" className="size-6 -rotate-45" />
            </span>
            <span className="font-head text-xl tracking-tight">
              AEROQUETZAL
              <span className="block font-sans text-xs font-bold tracking-[.25em]">
                TU PRÓXIMO DESTINO
              </span>
            </span>
          </a>
          <nav
            aria-label="Navegación principal"
            className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-bold"
          >
            <a href="#buscar" className="hover:underline">
              Buscar vuelos
            </a>
            <a href="#mi-reserva" className="hover:underline">
              Mi reserva
            </a>
            <a href="#estado" className="hover:underline">
              Estado de vuelo
            </a>
          </nav>
        </div>
        <div className="border-t-2 bg-secondary px-5 py-2 text-center font-head text-xs tracking-wider text-secondary-foreground sm:text-sm">
          VUELOS DIRECTOS · RESERVAS GRATUITAS · NUEVOS HORIZONTES
        </div>
      </header>
      <main
        id="contenido"
        className="mx-auto w-full max-w-6xl flex-1 space-y-16 px-5 py-10 sm:px-8 sm:py-14"
      >
        {children}
      </main>
      <footer className="border-t-4 bg-primary">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-5 py-5 text-sm font-medium sm:px-8">
          <p className="font-head">AEROQUETZAL</p>
          <p>Simulación académica · CC3067 Redes · UVG</p>
          <a href="#informacion" className="underline">
            Información para tu viaje
          </a>
        </div>
      </footer>
    </div>
  );
}
