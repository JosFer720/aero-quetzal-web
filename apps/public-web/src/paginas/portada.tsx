import { ArrowRight, Lock } from "lucide-react"

import { Marco } from "@/components/marco"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { dominio, servicios } from "@/data/grupo"
import { montar } from "@/main"

export function Portada() {
  return (
    <Marco>
      <section className="grid items-center gap-10 md:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Badge className="bg-mint">Grupo Aerolínea · Laboratorio 5</Badge>
          <h1 className="text-5xl leading-[1.1] md:text-7xl">
            Servicios de capa 7 en <span className="bg-primary px-2">pleno vuelo</span>
          </h1>
          <p className="max-w-xl text-lg">
            Red local del grupo con DNS, directorio LDAP, web, correo y FTP bajo el dominio{" "}
            <strong>{dominio}</strong>.
          </p>
          <Button asChild size="lg">
            <a href="/privado/">
              <Lock /> Entrar al área privada <ArrowRight />
            </a>
          </Button>
        </div>
        <Card className="rotate-2 bg-sky shadow-xl">
          <CardContent className="space-y-2 font-head">
            <p className="text-sm">PASE DE ABORDAR</p>
            <p className="text-4xl">GUA → LAN</p>
            <div className="flex justify-between border-t-2 border-dashed pt-3 text-sm">
              <span>PUERTA 80</span>
              <span>ASIENTO LDAP</span>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-20 space-y-6">
        <h2 className="text-3xl">Panel de servicios</h2>
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-primary">
                <TableHead>Servicio</TableHead>
                <TableHead>Nombre DNS</TableHead>
                <TableHead>Software</TableHead>
                <TableHead>Puerto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servicios.map((servicio) => (
                <TableRow key={servicio.host}>
                  <TableCell className="font-bold">{servicio.nombre}</TableCell>
                  <TableCell className="font-mono">{servicio.host}</TableCell>
                  <TableCell>{servicio.software}</TableCell>
                  <TableCell>{servicio.puerto}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>
    </Marco>
  )
}

montar(Portada)
