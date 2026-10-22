import { useEffect, useState } from "react"
import { BadgeCheck, LogOut } from "lucide-react"

import { Marco } from "@/components/marco"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { montar } from "@/main"

type Pasajero = { uid: string; cn: string; mail: string }

export function Privado() {
  const [pasajero, setPasajero] = useState<Pasajero | null>(null)

  useEffect(() => {
    fetch("/privado/usuario.json", { cache: "no-store" })
      .then((respuesta) => respuesta.json())
      .then(setPasajero)
      .catch(() => setPasajero(null))
  }, [])

  return (
    <Marco>
      <div className="mx-auto max-w-2xl space-y-8">
        <Badge className="bg-mint">
          <BadgeCheck /> Autenticado con LDAP
        </Badge>
        <h1 className="text-5xl leading-none">Bienvenido a bordo{pasajero ? `, ${pasajero.cn}` : ""}</h1>
        <Card className="bg-primary shadow-xl">
          <CardContent className="space-y-4 font-head">
            <p className="text-sm">TARJETA DE TRIPULANTE</p>
            <Separator className="bg-foreground" />
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 font-sans text-lg">
              <dt className="font-bold">uid</dt>
              <dd className="font-mono">{pasajero?.uid ?? "Sin datos"}</dd>
              <dt className="font-bold">cn</dt>
              <dd>{pasajero?.cn ?? "Sin datos"}</dd>
              <dt className="font-bold">mail</dt>
              <dd className="font-mono">{pasajero?.mail ?? "Sin datos"}</dd>
            </dl>
          </CardContent>
        </Card>
        <p>Esta sección solo es visible para usuarios válidos de ou=People,dc=aerolinea,dc=redes,dc=test.</p>
        <Button asChild variant="secondary" size="lg">
          <a href="/logout">
            <LogOut /> Cerrar sesión
          </a>
        </Button>
      </div>
    </Marco>
  )
}

montar(Privado)
