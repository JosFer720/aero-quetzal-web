# AeroQuetzal Web

Monorepo del proyecto de Redes. El alcance y la secuencia de turnos están en [la guía del equipo](GUIA_WEB_EQUIPO_AEROQUETZAL.md).

## Entrega de Nery: API e integración

`services/business-api` implementa búsqueda, disponibilidad, reservas gratuitas, consulta verificada, cancelación, vuelos/horarios, Check-In, auditoría, dashboard, autorización de Hugo, rate limiting y health de PostgreSQL. Las operaciones de inventario son transaccionales y controlan concurrencia.

`npm run test:e2e:integrated` recorre las dos webs con PostgreSQL y la API real. Requiere `TEST_DATABASE_URL` de una base exclusiva terminada en `_test`; el directorio LDAP es simulado sólo en pruebas. CI ejecuta todas las suites. Consulta [la API](services/business-api/README.md) y [el despliegue](deploy/README.md) para los pasos, límites y validación de producción.

La versión integrada está ejecutándose en Hetzner desde el 29/10/2026. Portal público: [https://178.104.151.184](https://178.104.151.184). La intranet permanece en `https://intranet.aeroquetzal.internal`, accesible desde empleados y VPN con su CA interna. Se verificaron LDAP real, reserva → Check-In, permisos, inventario, auditoría y persistencia tras reiniciar los contenedores. Consulta [el estado comprobado del despliegue](deploy/ESTADO_2026-10-29.md). La semilla ofrece vuelos los días **5 y 6 de noviembre de 2026**.

## Entrega de Ian: web pública

`apps/public-web` implementa el portal de AeroQuetzal con búsqueda de vuelos, cupos, pasajeros, reserva gratuita, confirmación con código, consulta por código/documento, cancelación y estado de vuelo. Conserva el diseño original mediante `packages/ui`, consume los contratos compartidos y agrega pruebas de componentes y Playwright en escritorio y móvil.

Ejecuta `npm run dev:public` para abrir `http://127.0.0.1:5173` y `npm run test:e2e:public` para los recorridos de navegador. El servidor de desarrollo dirige `/api/v1/public` a la API en `127.0.0.1:8080`. La API de Nery está en `services/business-api`; las pruebas propias del frontend conservan su fixture exclusiva de test.

Consulta [la entrega técnica pública](apps/public-web/README.md) para ejecutar las pruebas e integrar el frontend. El estado histórico de infraestructura se complementa con la revisión remota documentada en el estado de despliegue anterior.

## Entrega de Javier: intranet

`apps/internal-web` implementa login/logout con Auth de Hugo, rutas y navegación por rol, panel, creación/edición/desactivación de vuelos, programación y cambios de estado, disponibilidad, búsqueda de pasajeros/reservas, Check-In con asiento automático e historial de auditoría. Usa React, Vite, Tailwind y los contratos de Milton. No almacena contraseñas, cookies ni tokens en localStorage/sessionStorage; CSRF permanece en memoria. El backend conserva la autorización definitiva.

`packages/ui` contiene los componentes y tokens extraídos del sitio original: Archivo Black, Space Grotesk, colores, bordes y sombras. La web pública conserva sus rutas/importaciones mediante reexportaciones; Ian puede consumir directamente `@aeroquetzal/ui/button`, `@aeroquetzal/ui/card`, etc. Ambos sitios importan `@aeroquetzal/ui/theme.css` y registran `packages/ui/src` como fuente de Tailwind.

## Desarrollo local

Requisitos: Node >=22 y npm >=11.21.1, según `package.json`.

```bash
npm ci
npm run build
npm run dev:internal
```

Abre `http://127.0.0.1:5174`. Vite conserva el mismo origen del navegador y dirige `/api/v1/auth` a `127.0.0.1:8081` y `/api/v1/internal` a `127.0.0.1:8080`. No hay direcciones de infraestructura ni secretos en el bundle. El proxy sólo aplica al servidor de desarrollo; producción requiere la configuración de Nginx de Nery.

Para usar Auth real, prepara `.env` fuera de Git con un `SESSION_SECRET` aleatorio, `AUTH_MODE=ldap`, `AUTH_ORIGIN=http://127.0.0.1:5174` y los ajustes de LDAP/CA descritos en [Auth](services/auth-service/README.md). En otra terminal:

```bash
npm run start --workspace @aeroquetzal/auth-service
```

La API de negocio está implementada en `services/business-api`. Iníciala con `npm run dev:api`, con PostgreSQL migrado y Auth disponible. Los datos y usuarios ficticios están exclusivamente en las pruebas.

## Verificación

```bash
npm run lint
npm run typecheck
npm test
npm exec --workspace @aeroquetzal/internal-web -- playwright install chromium
npm run test:e2e:internal
```

Vitest cubre componentes, sesión, permisos, validación, errores, vuelos, horarios, disponibilidad, reservas y Check-In. Playwright inicia automáticamente Vite y una fixture en loopback (`18080/18081`): usa el servidor Auth y guard reales de Hugo, con directorio simulado y datos de negocio en memoria. Comprueba cookie HttpOnly, CSRF, rechazo de rol, Check-In persistente entre recargas dentro de la prueba, auditoría y creación/edición/programación de vuelos. No verifica PostgreSQL, LDAPS real ni ACL de Hetzner. Esa integración y el despliegue final corresponden a Nery.

## Contratos añadidos para Ian y Nery

Exportados desde `@aeroquetzal/api-contracts`, sin cambiar los contratos previos de autenticación o reservas:

| Método / ruta interna                                          | Respuesta                                                                                      | Roles                          |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------ |
| `GET /airports`                                                | `InternalAirport[]`: `id`, `code`, `name`, `city`, `country`, `active`                         | admin, operator                |
| `GET /aircraft`                                                | `InternalAircraft[]`: `id`, `registration`, `model`, `capacity`, `active`                      | admin, operator                |
| `GET /flights`                                                 | `InternalFlight[]`: `id`, `flightNumber`, `origin`, `destination`, `durationMinutes`, `active` | admin, operator                |
| `POST /flights`, `PATCH /flights/:id`                          | Un `InternalFlight`                                                                            | admin, operator                |
| `GET /flight-instances`                                        | `InternalFlightInstance[]`                                                                     | admin, operator                |
| `POST /flight-instances`, `PATCH /flight-instances/:id/status` | Un `InternalFlightInstance`                                                                    | admin, operator                |
| `GET /reservations?q=...`                                      | `InternalReservation[]`, búsqueda por código/nombre/apellido/documento (2–120 caracteres)      | admin, operator, checkin_agent |
| `GET /audit`                                                   | `AuditEventResponse[]`, recientes primero                                                      | admin, viewer                  |

Todas usan el prefijo `/api/v1/internal`. Las listas son arrays JSON sin envoltorio; fechas ISO 8601 con zona. `InternalFlightInstance` incluye `id`, `flightId`, `aircraftId`, `flightNumber`, `origin`, `destination`, `departureAt`, `arrivalAt`, `status`, `capacity`, `reservedSeats` y `availableSeats`. Origen/destino son códigos IATA; el inventario exige `reservedSeats + availableSeats === capacity`.

La intranet usa baja lógica (`PATCH /flights/:id` con `active: false`) y cancelación de salidas programadas; no inventa endpoints DELETE. Las fechas se ingresan y muestran en hora de Guatemala, y se envían en UTC. Check-In envía `{}` para todos los pasajeros y consume `CheckInResponse`; no elige ni calcula asientos en el navegador.

Nery deberá servir `apps/internal-web/dist`, habilitar fallback a `index.html` para rutas de la SPA y dirigir los prefijos de API a sus servicios antes del fallback. Debe conservar `Origin`, `Cookie`, `Set-Cookie` y `X-CSRF-Token`, servir la intranet por HTTPS para la cookie Secure de producción y evitar cachear respuestas privadas. No hay variables o migraciones de base de datos nuevas en este turno. El único ajuste a `.env.example` alinea `AUTH_ORIGIN` con el servidor local (`127.0.0.1:5174`).
