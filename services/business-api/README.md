# API de negocio de Nery

Fastify y PostgreSQL reales para las webs de Ian y Javier. Reutiliza contratos, reglas y repositorios de Milton y el guard de sesiones de Hugo. No implementa pagos ni notificaciones.

## Desarrollo

Desde la raíz, con `.env` fuera de Git y una base PostgreSQL preparada:

```bash
npm ci
npm run build
npm run prisma:migrate:deploy --workspace @aeroquetzal/database
npm run db:seed
npm run dev:api
```

Auth se inicia por separado con `npm run start --workspace @aeroquetzal/auth-service`. Los frontends conservan su proxy de desarrollo de mismo origen. La API escucha inicialmente en `127.0.0.1:8080`; producción configura la interfaz del contenedor, HTTPS en los proxies y el token del gateway.

Configuración adicional en `.env.example`: `BUSINESS_HOST`, `BUSINESS_PORT`, `AUTH_URL`, `PUBLIC_GATEWAY_TOKEN` y `TRUSTED_PROXIES`. En producción son obligatorios un token de al menos 32 caracteres y un `AUTH_ORIGIN` HTTPS. Los proxies de confianza se enumeran por dirección; nunca se confía en cualquier cliente. No se registra el cuerpo de las peticiones, documentos, cookies ni secretos. Health consulta PostgreSQL y devuelve 503 cuando no está disponible.

## Integración y reglas

- Implementa todos los endpoints públicos e internos definidos por `api-contracts`, sin envolver los arrays.
- Las fechas de búsqueda delimitan el día de Guatemala; los datos viajan en ISO 8601 UTC.
- Sólo se reservan vuelos activos, programados y futuros. La búsqueda excluye aeronaves y aeropuertos inactivos.
- Reserva, cancelación y Check-In bloquean la misma fila de `flight_instances` con `FOR UPDATE`. Cada operación confirma inventario, pasajeros, estado y auditoría dentro de una transacción.
- Una reserva es gratuita y queda confirmada inmediatamente. Los códigos usan aleatoriedad criptográfica y la restricción única de PostgreSQL; una colisión se reintenta dentro de una nueva transacción.
- No se permiten documentos repetidos dentro de la reserva ni reservas activas del mismo pasajero para la misma salida. Un documento existente no permite sobrescribir los nombres de otro pasajero.
- La consulta y la cancelación públicas verifican que el documento pertenece a la reserva. El resumen no incluye nombres, documentos, correo ni identificadores privados.
- Cancelar devuelve los cupos una sola vez. Una reserva cancelada o con Check-In rechaza la cancelación.
- Check-In completa la reserva entera. `{}` incluye todos los pasajeros; si se envía `passengerIds`, debe contener exactamente a todos. Se asigna el primer asiento disponible, de `1A` a `100F`, respetando la capacidad. Repetir el Check-In devuelve los mismos asientos sin duplicar registros ni auditoría.
- La intranet usa baja lógica y las transiciones de vuelos del dominio. Una ruta con reservas conserva sus aeropuertos. Los horarios validan aeronave, capacidad y solapamientos.
- El backend exige sesión y rol reales en cada ruta interna y comprueba Origin/CSRF para escrituras. El rol enviado por el cliente no tiene valor.
- El límite general es 120 peticiones por IP y minuto; crear reservas permite 20 por minuto. El gateway aplica otro límite y reemplaza los encabezados de origen del cliente.
- Un vuelo cancelado deja de venderse; los estados de reservas existentes se conservan hasta la cancelación explícita permitida por las reglas.

## Pruebas reales de persistencia

Crear una base **exclusiva de pruebas**, cuyo nombre termine en `_test`. Las pruebas de integración y E2E vacían esa base; nunca apuntarlas a datos del negocio.

```bash
export TEST_DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/aeroquetzal_test
DATABASE_URL="$TEST_DATABASE_URL" npm run prisma:migrate:deploy --workspace @aeroquetzal/database
npm run lint
npm run typecheck
npm test
npm exec --workspace @aeroquetzal/internal-web -- playwright install chromium
npm run test:e2e:public
npm run test:e2e:internal
npm run test:e2e:integrated
```

La integración usa PostgreSQL y la API de producción con `fastify.inject()`, incluyendo concurrencia de reservas/Check-In/cancelación, rollback y colisión de código. El recorrido integrado de navegador usa las dos webs y la API real; sólo el directorio LDAP se sustituye por una fixture de pruebas. Las suites originales de cada frontend se mantienen. Las pruebas de integración se omiten sin `TEST_DATABASE_URL`; CI siempre proporciona una base PostgreSQL aislada y las ejecuta.

El despliegue, rollback y validación de redes están en [deploy/README.md](../../deploy/README.md). Las pruebas locales no certifican LDAPS real ni las ACL de Hetzner.
