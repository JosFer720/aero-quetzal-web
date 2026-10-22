import type { ReactNode } from "react"
import { Plane } from "lucide-react"

import { dominio } from "@/data/grupo"

const avisos = ["Vuelos internos", "DNS autoritativo", "Login con LDAP", "Correo IMAP", "FTP pasivo"]

export function Marco({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b-4 bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <a href="/" className="flex items-center gap-3">
            <span className="grid size-11 place-items-center border-2 bg-primary shadow-md">
              <Plane className="size-6 -rotate-45" />
            </span>
            <span className="font-head text-xl tracking-tight">AEROLÍNEA REDES</span>
          </a>
          <nav className="flex items-center gap-5 font-medium">
            <a href="/" className="hover:underline">Inicio</a>
            <a href="/privado/" className="hover:underline">Área privada</a>
          </nav>
        </div>
        <div className="overflow-hidden border-t-2 bg-secondary py-2 text-secondary-foreground">
          <div className="animate-cinta flex w-max gap-10 font-head text-sm uppercase">
            {[...avisos, ...avisos, ...avisos, ...avisos].map((aviso, i) => (
              <span key={i}>✈ {aviso}</span>
            ))}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">{children}</main>
      <footer className="border-t-4 bg-primary">
        <div className="mx-auto max-w-6xl px-6 py-4 font-medium">
          Laboratorio 5 · Redes · {dominio}
        </div>
      </footer>
    </div>
  )
}
