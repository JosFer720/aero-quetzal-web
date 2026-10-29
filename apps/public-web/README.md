# Web pública: entrega de Ian

Frontend React/Vite/TypeScript para AeroQuetzal. Consume `@aeroquetzal/ui` y `@aeroquetzal/api-contracts`; conserva la paleta, fuentes, bordes y sombras del sitio original ya migrado al repositorio.

Implementa catálogo, búsqueda, disponibilidad, 1–9 pasajeros, reserva gratuita, código de confirmación, consulta verificada, cancelación y estado de vuelo. Retira el login LDAP y el perfil estático heredados del portal público. La intranet vive en otra aplicación.

## Ejecutar desde la raíz

```powershell
npm ci
npm run build
npm run dev:public
```

Abre `http://127.0.0.1:5173`. El workspace conserva el nombre `site` para mantener compatibilidad con los scripts existentes. Vite dirige **únicamente** `/api/v1/public` a `http://127.0.0.1:8080`. Hasta que Nery implemente la API, las consultas normales muestran errores y permiten reintentar. No hay datos simulados en el bundle de producción ni variables nuevas de entorno del frontend.

## Verificar

```powershell
npm run lint
npm run typecheck
npm test
npm exec --workspace site -- playwright install chromium
npm run test:e2e:public
```

Playwright levanta automáticamente Vite en `5173` y una fixture en loopback `18082`, con `NODE_ENV=test`. Usa el cliente HTTP real y valida respuestas según los contratos. Ejecuta tres escenarios en Chromium de escritorio y móvil: reserva/recarga/consulta/cancelación/cupos/estado, documento incorrecto y Check-In, vacío/error/reintento. La fixture no usa PostgreSQL ni LDAP, sólo almacena datos de prueba en memoria y no se despliega.

Para recorrer la fixture manualmente, abre dos terminales desde la raíz. En la primera ejecuta:

```powershell
$env:NODE_ENV = 'test'
node --import tsx apps/public-web/e2e/server.ts
```

En la segunda ejecuta `npm run dev:public:test`. Abre `http://127.0.0.1:5173` y busca GUA → SAL con fecha `2099-11-05`. Usa datos ficticios; por ejemplo Ana López, documento `P1234567` y correo `ana@example.com`. La fixture ofrece dos cupos y la primera reserva recibe `AQ00001`. Puedes recargar, consultar con código/documento y cancelar para liberar cupos. Los datos se pierden al reiniciar la fixture. Detén ambas terminales con Ctrl+C antes de iniciar Playwright y retira la variable de la primera con `Remove-Item Env:NODE_ENV` al terminar.

## Contrato de integración para Nery

Todos los endpoints usan `/api/v1/public`. Las respuestas son JSON sin envoltorios adicionales:

| Método y ruta                     | Petición                              | Respuesta validada                                     |
| --------------------------------- | ------------------------------------- | ------------------------------------------------------ |
| `GET /airports`                   | —                                     | `AirportResponse[]`: `code`, `name`, `city`, `country` |
| `GET /flights`                    | Query `origin`, `destination`, `date` | `PublicFlight[]`                                       |
| `GET /flights/:id/availability`   | `id` de la salida                     | `FlightAvailability`                                   |
| `POST /reservations`              | `CreateReservationRequest`            | `CreateReservationResponse`, normalmente HTTP 201      |
| `GET /reservations/:code`         | Query `documentNumber`                | `PublicReservation`                                    |
| `POST /reservations/:code/cancel` | JSON `{ documentNumber }`             | `CancelReservationResponse`                            |
| `GET /status/:flightNumber`       | Número `AQ` + 3 o 4 dígitos           | `PublicFlightStatus`                                   |

Los esquemas completos están en `packages/api-contracts/src/public.ts`. No se modificaron contratos compartidos durante este turno.

- `PublicFlight.id` debe ser el ID de **FlightInstance**, el mismo que acepta disponibilidad y `flightInstanceId` de la reserva.
- Origen/destino de búsqueda son códigos IATA en mayúsculas; `date` usa `YYYY-MM-DD`. La interfaz comunica hora de Guatemala (UTC−6). El backend debe aplicar ese criterio al rango de búsqueda por fecha. Las respuestas llevan ISO 8601 con zona y se muestran en `America/Guatemala`.
- La reserva envía nombres/apellidos/documentos por pasajero y `contactEmail`. El correo no dispara notificaciones. El servidor devuelve `{ code, status: 'CONFIRMED', message: 'Reserva gratuita confirmada' }`.
- El resumen público sólo muestra código, estado, número/ruta de vuelo, salida y número de pasajeros; no lista datos personales. La API verifica pertenencia del documento a la reserva.
- Cancelar envía el documento en el cuerpo y sólo se ofrece para `CONFIRMED`. La API vuelve a comprobar el estado, cancela a todos los pasajeros y restaura cupos de forma atómica.
- Las respuestas erróneas pueden seguir `ErrorResponse`; el frontend presenta textos genéricos por HTTP 400, 404, 409, 429 o fallo de servicio, sin mostrar mensajes privados arbitrarios. Un 409 de reserva refresca los cupos y conserva el formulario.
- El frontend impide doble envío local y no reintenta automáticamente escrituras. El servidor debe controlar concurrencia y transacciones para evitar sobreventa; este módulo no puede garantizarlo desde el navegador.
- Las respuestas válidas con una estructura incorrecta, un código distinto al consultado o cupos inconsistentes se rechazan como error de integración.

## Seguridad y despliegue

El navegador utiliza exclusivamente rutas públicas relativas, `credentials: 'omit'`, `cache: 'no-store'`, rechazo de redirecciones y límite de 15 segundos por petición. Código/documento y pasajeros permanecen en memoria, nunca en localStorage/sessionStorage. Las lecturas se cancelan al cambiar la consulta y sus respuestas antiguas se descartan. La página configura `referrer=no-referrer`.

Nery debe:

1. Construir y servir `apps/public-web/dist` en `edge-vpn` por HTTPS. Vite sólo es el servidor local de desarrollo.
2. Configurar el gateway con una lista cerrada de las rutas y métodos públicos anteriores, antes del fallback estático. Rechazar `/api/v1/auth`, `/api/v1/internal` y otros endpoints de servicios en el perímetro público.
3. Autenticar gateway → API mediante token de servicio o mTLS, con ACL específicas. No inyectar esos secretos en Vite ni en JavaScript del cliente.
4. Aplicar `Cache-Control: no-store` a reservas/respuestas con datos verificados; evitar registrar documentos y cuerpos de pasajeros en logs. El contrato existente usa documento en query para la consulta: configurar la redacción de ese query en proxy y API.
5. Aplicar rate limiting, límites de cuerpos, encabezados de seguridad y validación del lado servidor.
6. Validar PostgreSQL real, concurrencia, integración con intranet/Check-In, persistencia y ACL. Los E2E locales no cubren esas garantías.

No se modificaron redes, firewall, DNS, LDAP, servidores ni despliegues. No hay migraciones nuevas ni secretos nuevos en esta entrega.
