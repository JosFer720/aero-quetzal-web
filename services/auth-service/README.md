# Auth de AeroQuetzal

Servicio interno de Hugo. Proporciona login LDAPS, sesiones, logout y autorización para la futura API de Nery. No publica LDAP ni incorpora cuentas de producción al repositorio.

## Ejecución local

Desde la raíz:

```powershell
npm install
npm run build
npm run start --workspace @aeroquetzal/auth-service
```

La configuración se carga desde `.env` de la raíz o desde el entorno. `.env.example` enumera las variables. `SESSION_SECRET` debe sustituirse por un secreto aleatorio de al menos 32 caracteres. El servicio falla al iniciar con el valor de ejemplo.

`AUTH_ORIGIN` es el origen exacto del navegador de intranet, sin ruta ni barra final. El proxy de intranet debe dirigir `/api/v1/auth/*` a este servicio, conservar `Origin`, `Cookie` y `Set-Cookie`, y no permitir CORS. En producción se requieren `NODE_ENV=production`, HTTPS para intranet y `AUTH_MODE=ldap`. El proceso escucha por defecto sólo en loopback; el despliegue puede configurar `AUTH_HOST` dentro de una red interna restringida.

LDAPS usa `10.10.0.102:636`, verifica certificados y exige TLS 1.2 o superior. La CA interna se instala mediante `NODE_EXTRA_CA_CERTS` al arrancar Node. El certificado debe incluir la dirección o el nombre configurado en `LDAP_URL`. Nunca se desactiva la validación TLS.

El bind usa `uid=<usuario>,ou=People,dc=aeroquetzal,dc=internal`. El usuario autenticado necesita permiso LDAP de lectura de su nombre y de membresías `member`, `uniqueMember` o `memberUid` en los grupos inmediatos de `ou=Groups`. Los grupos `ti`, `operadores`, `checkin` y `monitoreo` se convierten en los roles compartidos. Un usuario sin estos grupos no recibe sesión.

`MockDirectory` permite desarrollo y pruebas por inyección explícita en `buildAuthServer`. No tiene cuentas predeterminadas. `AUTH_MODE=mock` requiere esa inyección y se rechaza en producción.

## Contrato del navegador

- `POST /api/v1/auth/login`: JSON con `username` y `password`, además de `Origin`.
- `GET /api/v1/auth/session`: devuelve `authenticated`, `user`, `csrfToken` y `expiresAt`. Sin sesión devuelve valores nulos y `authenticated: false`.
- `POST /api/v1/auth/logout`: requiere cookie, `Origin` y encabezado `X-CSRF-Token`.
- `GET /health`: disponibilidad del proceso, no una prueba de conexión LDAP.

La cookie firmada `aq_session` tiene `HttpOnly`, `SameSite=Strict`, ruta `/api/v1` y `Secure` en producción. El navegador conserva la cookie automáticamente. El frontend mantiene el token CSRF en memoria y lo adjunta a cada cambio interno. No se guarda la contraseña ni el identificador de sesión en almacenamiento del navegador.

Las sesiones expiran tras 30 minutos sin actividad o tras 8 horas en total. El identificador rota cada 15 minutos; el anterior conserva una ventana de 30 segundos para solicitudes concurrentes y después deja de funcionar. Un login nuevo invalida la sesión presentada previamente. Logout elimina ambos identificadores en el servidor.

## Consumo desde business-api

La API debe depender de `@aeroquetzal/auth-service`, decorar `authUser` una vez y aplicar el guard antes de ejecutar cada ruta interna:

```typescript
import { createAuthGuard } from "@aeroquetzal/auth-service";

api.decorateRequest("authUser", null);
api.post("/api/v1/internal/reservations/:code/check-in", {
  onRequest: createAuthGuard({
    authUrl: "http://auth-service:8081",
    origin: config.AUTH_ORIGIN,
    roles: ["checkin_agent"],
  }),
}, checkInHandler);
```

El guard consulta la sesión real en Auth, propaga la cookie renovada, valida CSRF en métodos que cambian estado y establece `request.authUser` para auditoría. No acepta roles enviados por el navegador. `admin` tiene acceso a todas las rutas; los demás roles deben enumerarse conforme al contrato interno. Para dashboard se enumeran los cuatro roles. La API también debe instalar encabezados de seguridad mediante `@fastify/helmet`.

Auth debe permanecer accesible sólo para intranet y business-api. El transporte entre API y Auth requiere una red interna con ACL o HTTPS. Nunca se expone Auth a través del gateway público.

## Límites y pruebas

Se permiten cinco intentos por usuario y veinte por IP en quince minutos. El bloqueo temporal devuelve `429` y `Retry-After`. Los nombres se normalizan para el bloqueo y no se confía en `X-Forwarded-For`. Detrás de un proxy, el límite por IP corresponde al proxy y es compartido; antes de un despliegue con mayor tráfico debe configurarse confianza exclusivamente en el proxy autorizado, nunca en cualquier origen.

Sesiones y bloqueos residen en memoria, con un máximo de diez mil entradas por almacén. El despliegue actual debe usar una sola instancia Auth. Un reinicio cierra las sesiones y reinicia los bloqueos. Varias réplicas o bloqueos persistentes requieren un almacén compartido. La revocación de grupos LDAP se aplica al siguiente login o al vencer la sesión.

```powershell
npm run test --workspace @aeroquetzal/auth-service
npm run lint
npm run typecheck
npm test
```

Las pruebas usan Fastify inyectado y LDAP simulado: credenciales válidas e inválidas, caída LDAP, grupos, inyección LDAP, cookies, rotación, expiración, logout, CSRF, bloqueos y permisos consumidos por una API separada. La validación contra el LDAP real requiere VPN, CA y credenciales nominales fuera de Git.

La entrega de la llave pública SSH de Hugo y la creación de su cuenta siguen siendo tareas del equipo de infraestructura. No se accede a servidores con cuentas ajenas ni se despliega parcialmente este módulo.
