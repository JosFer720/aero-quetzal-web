import { CircleAlert, KeyRound } from "lucide-react"

import { Marco } from "@/components/marco"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { montar } from "@/main"

const credencialesRechazadas = new URLSearchParams(window.location.search).has("error")

export function Login() {
  return (
    <Marco>
      <div className="mx-auto max-w-md">
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <KeyRound /> Control de abordaje
            </CardTitle>
            <CardDescription>Ingrese con su usuario del directorio LDAP del grupo.</CardDescription>
          </CardHeader>
          <CardContent>
            <form method="post" action="/dologin" className="space-y-5">
              {credencialesRechazadas && (
                <Alert status="error">
                  <CircleAlert />
                  <AlertTitle>Acceso denegado</AlertTitle>
                  <AlertDescription>Usuario inexistente o contraseña incorrecta.</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="usuario">Usuario</Label>
                <Input id="usuario" name="httpd_username" autoComplete="username" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clave">Contraseña</Label>
                <Input id="clave" name="httpd_password" type="password" autoComplete="current-password" required />
              </div>
              <Button type="submit" className="w-full" size="lg">
                Abordar
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </Marco>
  )
}

montar(Login)
