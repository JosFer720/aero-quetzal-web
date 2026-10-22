# Guía de implementación web para el equipo AeroQuetzal

**Responsables:** Ian, Javier, Nery, Milton y Hugo  
**Condición obligatoria:** los cinco integrantes deben desarrollar código de producción y pruebas automatizadas. Documentar, diseñar diapositivas o tomar capturas no sustituye la contribución de código.

## 1. Objetivo

Construir dos aplicaciones distintas que compartan una lógica de negocio segura:

1. **Web pública:** evolución directa del diseño actual de “Aerolínea Redes”, accesible desde Internet para consultar vuelos, disponibilidad y gestionar una reserva simulada.
2. **Web interna:** aplicación nueva accesible únicamente desde redes autorizadas/VPN para administrar vuelos, disponibilidad, reservas, pasajeros y Check-In. Debe usar el mismo sistema visual para sentirse parte del mismo producto.

La web pública nunca debe conectarse directamente a LDAP, PostgreSQL ni a los contenedores internos. La web interna no debe publicarse en Internet.

## 2. Estado inicial

Existe una compilación React estática en `10.10.0.116`, servida por Nginx. Contiene portada, `/login/` y `/privado/`, pero no implementa autenticación real ni lógica del negocio. El código fuente original se encuentra en `Desktop/lab05redes/web/site`.

Ese diseño es la base oficial de ambos portales:

- **Pública:** se mueve el código fuente completo, se conserva el estilo actual y se rediseña el contenido para AeroQuetzal y sus clientes.
- **Intranet:** se construye otra aplicación con los mismos tokens, tipografías, componentes y personalidad visual, pero con navegación y pantallas operativas.

No se debe reemplazar este diseño por una plantilla genérica. Tampoco se debe copiar literalmente la navegación pública dentro de la intranet.

No existe todavía:

- web pública desplegada;
- backend/API;
- base de datos del negocio;
- login LDAP funcional;
- control de acceso por roles;
- CRUD de vuelos;
- reservas o Check-In persistentes.

## 3. Arquitectura objetivo

```text
Internet
   │ HTTPS 443
   ▼
edge-vpn
   ├── public-web (React estático)
   └── public-gateway (/api/v1/public/* únicamente)
               │ mTLS o token de servicio + ACL específica
               ▼
core-app / Servicios
   ├── business-api      10.10.0.103:8080
   ├── postgres          10.10.0.104:5432
   └── ldap-interno      10.10.0.102:636

Redes autorizadas / WireGuard
   │ HTTP interno o HTTPS interno
   ▼
intranet                10.10.0.116:80
   └── /api → business-api
```

Las IP `.103` y `.104` son reservas propuestas dentro de Servicios `10.10.0.96/28`. No deben configurarse en producción hasta actualizar Compose, `aeroquetzal-container-net.sh`, DNS y ACL.

## 4. Tecnologías acordadas

Para evitar cinco implementaciones incompatibles:

- **Lenguaje común:** TypeScript.
- **Frontend:** React + Vite + Tailwind.
- **Backend:** Node.js + Fastify.
- **Base de datos:** PostgreSQL.
- **Validación:** Zod.
- **ORM/migraciones:** Prisma.
- **Pruebas frontend:** Vitest + Testing Library.
- **Pruebas backend:** Vitest + `fastify.inject()`.
- **Pruebas extremo a extremo:** Playwright.
- **Contenedores:** Docker Compose.
- **Formato/calidad:** ESLint, Prettier y TypeScript estricto.

Si el equipo decide cambiar una tecnología, debe hacerlo antes de comenzar y actualizar este documento; no se permiten dos frameworks backend o dos modelos de datos paralelos.

## 5. Estructura del código

```text
web-aeroquetzal/
├── apps/
│   ├── public-web/          # Ian
│   └── internal-web/        # Javier
├── services/
│   ├── business-api/        # Nery
│   └── auth-service/        # Hugo
├── packages/
│   ├── domain/              # Milton
│   ├── api-contracts/       # compartido; dueño primario Milton
│   └── ui/                  # componentes compartidos
│       ├── tokens/          # color, tipografía, sombras y espaciado del diseño actual
│       └── components/      # botones, tarjetas, formularios, tablas y estados
├── database/
│   ├── prisma/
│   ├── migrations/
│   └── seed/
├── deploy/
│   ├── public/
│   ├── internal/
│   └── docker-compose.yml
├── tests/
│   └── e2e/
├── .env.example
├── package.json
└── README.md
```

## 6. Repartición: todos deben programar

### 6.1 Ian — frontend público

Debe escribir código en `apps/public-web/`.

Entregables de código:

- migración del código fuente actual desde `Desktop/lab05redes/web/site` a `apps/public-web`;
- eliminación de referencias a “Laboratorio 5” y `aerolinea.redes.test`;
- conservación del lenguaje neobrutalista, tipografías Archivo Black/Space Grotesk, bordes, sombras y paleta existente;
- portada de AeroQuetzal;
- buscador por origen, destino y fecha;
- listado de vuelos y disponibilidad;
- formulario de datos del pasajero;
- flujo de reserva simulada y pantalla de confirmación;
- consulta de reserva por código;
- manejo de carga, errores, vacío y reintento;
- cliente HTTP tipado basado en `api-contracts`;
- pruebas de componentes y al menos un flujo Playwright.

No debe incluir secretos ni llamar a direcciones `10.10.0.x` desde el navegador público. Todas las solicitudes públicas usan `/api/v1/public` en el mismo origen.

### 6.2 Javier — frontend interno

Debe escribir código en `apps/internal-web/`.

Entregables de código:

- extracción y consumo de componentes compartidos desde `packages/ui`;
- adaptación del diseño actual a pantallas densas de operación sin perder legibilidad;
- pantalla de login y cierre de sesión;
- protección de rutas según sesión y rol;
- panel operacional;
- vistas CRUD de vuelos y horarios;
- vista de disponibilidad por vuelo;
- búsqueda de pasajeros y reservas;
- flujo de Check-In y asignación de asiento;
- historial básico de auditoría;
- pruebas de componentes, rutas protegidas y permisos.

El frontend no decide la autorización definitiva: debe ocultar acciones no permitidas, pero el backend también debe rechazarlas.

### 6.3 Nery — API y lógica del negocio

Debe escribir código en `services/business-api/`.

Entregables de código:

- servidor Fastify con health check;
- casos de uso para búsqueda de vuelos y disponibilidad;
- creación y consulta de reservas;
- generación de código de reserva único;
- reglas para reducir/restaurar inventario de asientos;
- CRUD interno de vuelos y horarios;
- Check-In idempotente;
- middleware de autorización que consuma la sesión emitida por Auth;
- manejo uniforme de errores;
- pruebas unitarias y de integración para cada caso de uso.

Reglas mínimas:

- no reservar más asientos que la capacidad disponible;
- una reserva confirmada reduce disponibilidad dentro de una transacción;
- repetir el mismo Check-In no crea duplicados;
- las operaciones internas registran actor, fecha y acción;
- endpoints públicos nunca exponen datos privados de pasajeros.

### 6.4 Milton — modelo de dominio y persistencia

Debe escribir código en `packages/domain/`, `packages/api-contracts/` y `database/`.

Entregables de código:

- tipos y validadores compartidos;
- esquema Prisma;
- migraciones versionadas;
- restricciones, índices y relaciones;
- repositorios de acceso a datos;
- semilla reproducible con aeropuertos, aeronaves, vuelos y horarios;
- script de backup y restauración de PostgreSQL;
- pruebas de repositorios y migraciones.

Entidades mínimas:

- `Airport`;
- `Aircraft`;
- `Flight`;
- `FlightInstance`;
- `Passenger`;
- `Reservation`;
- `ReservationPassenger`;
- `SeatAssignment`;
- `CheckIn`;
- `AuditEvent`.

Los contratos de API deben exportarse como paquete compartido para que ambos frontends y el backend utilicen los mismos tipos.

### 6.5 Hugo — autenticación LDAP y seguridad de aplicación

Debe escribir código en `services/auth-service/` y pruebas de seguridad.

Entregables de código:

- endpoint de login que realice bind por LDAPS contra `10.10.0.102:636`;
- mapeo de grupos LDAP a roles de aplicación;
- sesión mediante cookie `HttpOnly`, `Secure` en producción y `SameSite=Strict`;
- endpoint de sesión actual y logout;
- rotación/expiración de sesión;
- limitación de intentos y bloqueo temporal;
- protección CSRF para operaciones con sesión;
- encabezados de seguridad;
- pruebas de credenciales válidas, inválidas, LDAP caído, expiración y rol insuficiente.

Roles iniciales:

| Grupo LDAP | Rol | Capacidades |
|---|---|---|
| `ti` | `admin` | Configuración y todas las operaciones |
| `operadores` | `operator` | Vuelos, disponibilidad y reservas |
| `checkin` | `checkin_agent` | Consulta de reserva y Check-In |
| `monitoreo` | `viewer` | Panel y auditoría de sólo lectura |

Hugo debe entregar primero su llave pública SSH para obtener cuenta nominal en ambos servidores. Mientras tanto puede desarrollar y probar localmente; no debe usar la cuenta de otro integrante.

## 7. Trabajo compartido obligatorio

Además de su módulo principal, cada integrante debe:

- trabajar durante su turno asignado sobre la rama `main`;
- comenzar únicamente cuando el integrante anterior haya terminado y publicado su commit;
- incluir pruebas automatizadas de su código;
- dejar `main` ejecutable y con las pruebas aprobadas antes de ceder el turno;
- corregir conflictos de tipos o contratos que provoque su módulo;
- participar en una prueba integrada.

Una contribución no cuenta como código si contiene únicamente Markdown, capturas, configuración visual o cambios generados sin entenderlos. Debe existir lógica ejecutable y pruebas relacionadas.

## 8. Sistema visual compartido

El diseño actual se considera un activo del proyecto. Antes de crear pantallas, Ian y Javier deben extraer a `packages/ui`:

- fuentes Archivo Black y Space Grotesk;
- colores principales y secundarios;
- bordes negros, radios, sombras desplazadas y estados de interacción;
- botones, inputs, badges, tarjetas, alertas y encabezados;
- reglas responsive;
- estados de carga, vacío, error, éxito y acceso denegado.

### Web pública

Debe conservar el carácter visual abierto y promocional de la página actual. Sus secciones recomendadas son:

1. encabezado y propuesta de valor de AeroQuetzal;
2. buscador de vuelos como acción principal;
3. destinos y promociones;
4. resultados de disponibilidad;
5. reserva paso a paso;
6. consulta de reserva/estado;
7. información y contacto.

### Intranet

Debe sentirse parte de la misma marca, pero priorizar productividad:

1. login interno;
2. navegación lateral por rol;
3. panel con estado operativo;
4. tablas y filtros de vuelos/reservas;
5. formularios de edición;
6. flujo rápido de Check-In;
7. auditoría y mensajes de seguridad.

La intranet no debe mostrar promociones ni formularios de compra. La web pública no debe mostrar administración, auditoría ni datos privados de pasajeros.

## 9. Contrato de API público

Prefijo: `/api/v1/public`.

| Método | Endpoint | Función |
|---|---|---|
| `GET` | `/airports` | Catálogo de aeropuertos activos |
| `GET` | `/flights?origin=&destination=&date=` | Búsqueda de vuelos |
| `GET` | `/flights/:id/availability` | Cupos y tarifa simulada |
| `POST` | `/reservations` | Crear reserva |
| `GET` | `/reservations/:code` | Consultar resumen con dato de verificación |
| `POST` | `/reservations/:code/cancel` | Cancelación simulada según reglas |
| `GET` | `/status/:flightNumber` | Estado público del vuelo |

Ejemplo de creación de reserva:

```json
{
  "flightInstanceId": "fi_123",
  "passengers": [
    {
      "firstName": "Ana",
      "lastName": "López",
      "documentNumber": "P1234567"
    }
  ],
  "contactEmail": "ana@example.com"
}
```

La respuesta no debe incluir identificadores internos innecesarios ni datos de otros pasajeros.

## 10. Contrato de API interno

Prefijo: `/api/v1/internal`. Requiere sesión y rol.

| Método | Endpoint | Roles |
|---|---|---|
| `GET/POST` | `/flights` | `admin`, `operator` |
| `PATCH` | `/flights/:id` | `admin`, `operator` |
| `GET/POST` | `/flight-instances` | `admin`, `operator` |
| `PATCH` | `/flight-instances/:id/status` | `admin`, `operator` |
| `GET` | `/reservations` | `admin`, `operator`, `checkin_agent` |
| `GET` | `/reservations/:code` | `admin`, `operator`, `checkin_agent` |
| `POST` | `/reservations/:code/check-in` | `admin`, `checkin_agent` |
| `GET` | `/audit` | `admin`, `viewer` |
| `GET` | `/dashboard` | todos los roles internos |

Autenticación:

| Método | Endpoint | Función |
|---|---|---|
| `POST` | `/api/v1/auth/login` | Validar LDAP e iniciar sesión |
| `GET` | `/api/v1/auth/session` | Usuario y roles actuales |
| `POST` | `/api/v1/auth/logout` | Invalidar sesión |

## 11. Reglas de separación pública/interna

1. La web pública sólo conoce al `public-gateway`.
2. El gateway expone una lista cerrada de endpoints públicos.
3. LDAP sólo acepta conexiones desde servicios internos autorizados.
4. PostgreSQL sólo acepta conexiones desde `business-api` y tareas administrativas de TI.
5. La intranet permanece en `10.10.0.116`; no se crea DNAT público.
6. Visitantes puede navegar por Internet, pero no acceder a la intranet.
7. La futura publicación `80/443` en `edge-vpn` debe apuntar únicamente a la web pública.
8. Debe existir HTTPS antes de aceptar credenciales o datos de pasajeros desde Internet.

## 12. Variables de entorno

El repositorio sólo debe contener `.env.example`:

```dotenv
NODE_ENV=development
DATABASE_URL=postgresql://USER:PASSWORD@postgres:5432/aeroquetzal
LDAP_URL=ldaps://10.10.0.102:636
LDAP_BASE_DN=dc=aeroquetzal,dc=internal
LDAP_PEOPLE_OU=ou=People
LDAP_GROUPS_OU=ou=Groups
SESSION_SECRET=replace-with-secret-manager-value
PUBLIC_API_BASE_URL=/api/v1/public
INTERNAL_API_BASE_URL=/api/v1/internal
```

No deben versionarse valores reales.

## 13. Flujo Git

El equipo trabajará de forma secuencial sobre una sola rama:

```text
main
```

No deben programar dos integrantes al mismo tiempo. Cada turno usa este procedimiento:

```bash
git switch main
git pull --ff-only origin main
npm install
npm run typecheck
npm test

# realizar el trabajo asignado

npm run lint
npm run typecheck
npm test
git status
git add <archivos-del-turno>
git commit -m "tipo(modulo): descripcion concreta"
git push origin main
```

Después del `push`, el integrante comunica al siguiente:

- hash del commit;
- módulo modificado;
- pruebas ejecutadas;
- variables o migraciones nuevas;
- cualquier limitación conocida.

Reglas obligatorias:

- sólo una persona tiene el turno de escritura sobre `main`;
- nadie comienza con cambios locales antiguos;
- siempre se ejecuta `git pull --ff-only` al comenzar;
- commits pequeños y descriptivos;
- no se usa `git push --force`;
- no se desactivan pruebas para poder publicar;
- no se suben secretos, `.env` reales ni llaves;
- si las pruebas fallan después del commit, la misma persona corrige el problema antes de ceder el turno;
- los cambios de contratos se comunican antes de que comience el turno del siguiente consumidor.

### Orden inicial de turnos

1. **Milton:** dominio, contratos, esquema y migración inicial.
2. **Hugo:** autenticación, sesiones, roles y seguridad.
3. **Javier:** estructura y pantallas de la intranet usando contratos, Auth y componentes compartidos.
4. **Ian:** migración y programación de la web pública.
5. **Nery:** API, repositorios, lógica del negocio e integración final de los flujos.

Después comienza una segunda ronda en el mismo orden para integración, correcciones y pruebas extremo a extremo. El orden puede cambiar, pero debe existir un único responsable activo en cada momento.

## 14. Integración por etapas

### Etapa 1 — base común

- Ian importa el código fuente actual y extrae el sistema visual inicial.
- Javier construye el shell de intranet usando `packages/ui`, sin copiar las páginas públicas.
- Milton crea dominio, contratos, esquema y semilla.
- Nery crea el servidor y health check usando los contratos.
- Hugo crea el servicio Auth con un adaptador LDAP simulado para desarrollo.

### Etapa 2 — flujos verticales

1. Buscar vuelo de extremo a extremo.
2. Crear reserva y reducir disponibilidad.
3. Login LDAP y sesión interna.
4. Crear/editar vuelo desde la intranet.
5. Ejecutar Check-In y registrar auditoría.

### Etapa 3 — seguridad e infraestructura

- imágenes Docker sin ejecutar como root cuando sea posible;
- health checks;
- secretos fuera de Git;
- HTTPS público;
- ACL para `.103` y `.104`;
- rate limit y límites de tamaño;
- backups y restauración probada.

### Etapa 4 — despliegue y demostración

- desplegar primero en entorno de prueba;
- ejecutar pruebas automáticas;
- validar permitidos y bloqueos de red;
- publicar la web pública sólo después de aprobar HTTPS;
- reiniciar servicios y comprobar persistencia.

## 15. Criterios de aceptación

### Web pública

- mantiene la calidad y personalidad del diseño actual;
- todas las referencias visibles corresponden a AeroQuetzal, no a Laboratorio 5;
- carga desde Internet por HTTPS;
- busca vuelos con datos reales de la base;
- muestra disponibilidad;
- crea una reserva válida;
- impide sobreventa;
- permite consultar la reserva;
- no expone endpoints internos;
- no puede contactar LDAP ni PostgreSQL directamente.

### Web interna

- reutiliza el sistema visual compartido sin duplicar componentes;
- sólo abre desde una red autorizada o VPN;
- autentica mediante LDAPS;
- aplica roles tanto en frontend como backend;
- administra vuelos y horarios;
- consulta reservas y completa Check-In;
- registra auditoría;
- Visitantes e Internet no pueden acceder.

### Calidad

- `npm run lint` termina correctamente;
- `npm run typecheck` termina correctamente;
- pruebas unitarias e integración pasan;
- Playwright cubre reserva pública y Check-In interno;
- no hay secretos en el historial Git;
- los contenedores sobreviven un reinicio;
- existe rollback documentado.

## 16. Demostración final sugerida

1. Abrir la web pública desde Internet y buscar un vuelo.
2. Crear una reserva y guardar su código.
3. Activar WireGuard y abrir la intranet.
4. Iniciar sesión con un usuario LDAP de Check-In.
5. Buscar el código creado y completar Check-In.
6. Mostrar reducción de disponibilidad y evento de auditoría.
7. Intentar una acción administrativa con rol insuficiente y observar `403`.
8. Desde Visitantes, demostrar Internet permitido e intranet bloqueada.
9. Mostrar que PostgreSQL y LDAP no están publicados.

## 17. Acciones antes de programar

- Hugo entrega su llave pública SSH.
- El equipo crea el repositorio/carpeta `web-aeroquetzal`.
- Ian importa la fuente de `Desktop/lab05redes/web/site`; no debe trabajar únicamente sobre `dist/`.
- Ian y Javier acuerdan los componentes que pasarán a `packages/ui`.
- Milton publica la primera versión de contratos y esquema.
- Se acuerda la nomenclatura de roles LDAP.
- Fernando revisa cualquier cambio de firewall, rutas o despliegue antes de aplicarlo a Hetzner.

