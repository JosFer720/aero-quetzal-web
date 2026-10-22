# Contexto completo del proyecto AeroQuetzal

**Curso:** CC3067 Redes  
**Proveedor:** Hetzner Cloud  
**Estado verificado:** 22 de octubre de 2026  
**Equipo:** Fernando, Ian, Javier, Nery, Milton y Hugo

## 1. Propósito de este documento

Este archivo permite continuar el proyecto sin depender del historial de conversaciones. Resume la arquitectura, el estado observado en Hetzner, las decisiones de seguridad, los servicios desplegados, las pruebas realizadas y los pendientes. No contiene claves privadas ni contraseñas.

## 2. Estado ejecutivo

La infraestructura de las fases 2 y 3 está operativa. Hay dos máquinas virtuales Ubuntu 24.04 conectadas por una red privada de Hetzner. `edge-vpn` es el único límite público y `core-app` aloja nueve contenedores aislados. DHCP, DNS, NTP, LDAP, Monitoreo, intranet y Visitantes están desplegados con servicios persistentes.

La infraestructura de red está terminada para el alcance actual, pero la capa web de negocio todavía no está completa. El equipo tomó la siguiente decisión de producto: el diseño actual de “Aerolínea Redes” se conservará, se moverá y se convertirá en la web pública de AeroQuetzal; la intranet será una aplicación nueva con el mismo lenguaje visual, pero con funciones internas diferentes.

Las evidencias de infraestructura y servicios de la Fase 3 ya existen en los informes y carpetas del proyecto. El equipo web no debe producir capturas ni nuevas evidencias visuales como parte de su asignación; debe entregar código funcional y tests del código.

- la intranet `10.10.0.116` sirve temporalmente el frontend React estático que será migrado a la web pública;
- el contenido desplegado todavía se identifica como “Aerolínea Redes · Laboratorio 5”;
- `/login/` es una interfaz visual, pero Nginx no ejecuta la autenticación LDAP que el proyecto original esperaba de Apache;
- no hay backend de vuelos, disponibilidad, reservas, pasajeros o Check-In;
- no existe todavía una página pública en HTTP/HTTPS;
- `edge-vpn` sólo publica actualmente SSH y WireGuard.

## 3. Infraestructura de Hetzner

### 3.1 Máquinas virtuales

| Servidor | Función | IP pública | IP privada | Estado observado |
|---|---|---:|---:|---|
| `edge-vpn` | Bastión, WireGuard, firewall, NAT y uplink de Visitantes | `178.104.151.184` | `172.20.0.2` | Activo desde 16/10/2026 08:52, hora Guatemala |
| `core-app` | Router interno, bridges, DHCP y contenedores | Ninguna | `172.20.0.3` | Activo desde 16/10/2026 08:51, hora Guatemala |

Red privada: `172.20.0.0/16` mediante gateway administrado `172.20.0.1`.

Rutas administradas del diseño:

| Destino | Próximo salto |
|---|---:|
| `10.10.0.0/24` | `172.20.0.3` (`core-app`) |
| `10.200.0.0/24` | `172.20.0.2` (`edge-vpn`) |

### 3.2 Estado de `edge-vpn`

Servicios persistentes activos y habilitados:

- `nftables`;
- `wg-quick@wg0`;
- `aeroquetzal-visitor-edge`.

Interfaces relevantes:

| Interfaz | Dirección | Uso |
|---|---:|---|
| `eth0` | `178.104.151.184/32` | Internet |
| `enp7s0` | `172.20.0.2/32` | Red privada Hetzner |
| `wg0` | `10.200.0.1/24` | VPN del equipo |
| `aq-visitor` | `10.255.255.1/30` | GRE para salida controlada de Visitantes |

Puertos públicos observados:

- `22/TCP`: SSH;
- `51820/UDP`: WireGuard.

No están abiertos `80/TCP` ni `443/TCP`; por tanto, la web pública todavía no existe en producción.

### 3.3 Estado de `core-app`

Servicios activos y habilitados:

- `docker`;
- `aeroquetzal-network`;
- `aeroquetzal-dhcp`;
- `aeroquetzal-containers`;
- `nftables`.

`core-app` no tiene IP pública. La tabla principal no posee ruta predeterminada a Internet. La única ruta predeterminada está en la tabla de política `visitantes` y sólo se selecciona para tráfico cuyo origen sea `10.10.0.144/28`.

En el host se observaron únicamente SSH, DHCP y servicios locales del sistema. Los puertos de DNS, NTP, LDAP, Monitoreo e intranet existen dentro de los espacios de red de sus contenedores, no publicados indiscriminadamente en el host.

## 4. Subredes internas

| Zona | Red | Gateway | Carga actual |
|---|---:|---:|---|
| Operadores | `10.10.0.0/27` | `10.10.0.1` | `operador01` `.4` |
| Check-In | `10.10.0.32/28` | `10.10.0.33` | `checkin01` `.36` por DHCP |
| TI | `10.10.0.48/28` | `10.10.0.49` | `ti01` `.52` |
| Monitoreo | `10.10.0.64/28` | `10.10.0.65` | `monitor01` `.68:8080` |
| Disponibilidad | `10.10.0.80/28` | `10.10.0.81` | Sin contenedor conectado; bridge abajo por ausencia de enlace |
| Servicios | `10.10.0.96/28` | `10.10.0.97` | DNS `.100`, NTP `.101`, LDAP `.102` |
| DMZ | `10.10.0.112/28` | `10.10.0.113` | Intranet `.116:80` |
| Perímetro lógico | `10.10.0.128/28` | `10.10.0.129` | Reservada; bridge abajo por ausencia de enlace |
| Visitantes | `10.10.0.144/28` | `10.10.0.145` | `visitante01` `.148` por DHCP |

Un bridge sin interfaz conectada puede aparecer `DOWN` aunque su configuración sea persistente. En la verificación actual esto aplica a Disponibilidad y Perímetro.

## 5. Contenedores

Los nueve contenedores llevaban seis días activos al momento de la verificación:

| Contenedor | Imagen | Función |
|---|---|---|
| `operador01` | `alpine:3.20` | Cliente de Operadores |
| `checkin01` | `alpine:3.20` | Cliente DHCP de Check-In |
| `ti01` | `alpine:3.20` | Cliente administrativo de TI |
| `monitor01` | `nginx:1.27-alpine` | Servicio de Monitoreo `:8080` |
| `dns-interno` | `coredns/coredns:1.12.4` | DNS interno |
| `ntp-interno` | `aeroquetzal/chrony:1.0` | Hora interna |
| `ldap-interno` | `aeroquetzal/openldap:1.0` | Directorio LDAP/LDAPS |
| `intranet` | `nginx:1.27-alpine` | Frontend interno estático |
| `visitante01` | `alpine:3.20` | Cliente aislado con Internet |

Todos usan `network_mode: none`. El script `aeroquetzal-container-net.sh` crea interfaces `veth` y conecta cada contenedor únicamente a su bridge. Docker tiene deshabilitada la administración automática de `iptables` y el bridge predeterminado.

## 6. Servicios de red

### 6.1 DHCP

`dnsmasq` atiende Operadores, Check-In, TI y Visitantes. Las concesiones verificadas incluyen:

- `checkin01`: `10.10.0.36/28`, gateway `.33`;
- `visitante01`: `10.10.0.148/28`, gateway `.145`.

### 6.2 DNS

- Contenedor: `dns-interno`.
- Dirección: `10.10.0.100`.
- Puertos: `53/UDP` y `53/TCP`.
- Zona: `aeroquetzal.internal`.
- Registro principal: `intranet.aeroquetzal.internal → 10.10.0.116`.

### 6.3 NTP

- Contenedor: `ntp-interno`.
- Dirección: `10.10.0.101`.
- Puerto: `123/UDP`.
- Estado actual: estrato 8 y `Leap status: Normal`.

Opera como reloj local porque `core-app` no tiene salida general a Internet.

### 6.4 LDAP

- Contenedor: `ldap-interno`.
- Dirección: `10.10.0.102`.
- LDAPS permitido: `636/TCP`.
- Base: `dc=aeroquetzal,dc=internal`.
- Identidad de demostración existente: `uid=ti-demo,ou=People,...`.
- Grupo de demostración: `cn=ti,ou=Groups,...`.

El bind de `ti-demo` fue validado el 16/10/2026 y el contenedor continúa activo. Las contraseñas se guardan únicamente en archivos `root:root` dentro del servidor y no deben copiarse al repositorio.

### 6.5 Intranet actual

- Contenedor: `intranet`.
- Dirección: `10.10.0.116:80`.
- Nombre: `intranet.aeroquetzal.internal`.
- Servidor: Nginx.
- Frontend: React/Vite compilado y montado como archivos estáticos.
- Título observado: `Aerolínea Redes`.

La portada y `/login/` cargan, pero no hay backend ni autenticación LDAP efectiva. El README del sitio de origen describe módulos de Apache (`mod_auth_form` y `mod_authnz_ldap`); esos módulos no existen en el contenedor Nginx actual.

Esta ubicación es temporal. El código fuente original en `Desktop/lab05redes/web/site` será la base de la **web pública**. Se conservarán su estilo neobrutalista, tipografía, colores y componentes, pero se reemplazarán el nombre “Laboratorio 5”, el dominio y el contenido por AeroQuetzal y su lógica de vuelos/reservas. En `10.10.0.116` se desplegará una **intranet nueva**, visualmente coherente con la pública, que implementará autenticación LDAP, roles, operaciones y Check-In.

## 7. WireGuard y administración

| Integrante | IP VPN | Peer configurado | Cuenta SSH en ambas VMs |
|---|---:|---|---|
| Fernando | `10.200.0.2` | Sí; último handshake observado hace aproximadamente 5 días | Sí |
| Nery | `10.200.0.3` | Sí; sin handshake observado en la consulta actual | Sí |
| Ian | `10.200.0.4` | Sí; sin handshake observado en la consulta actual | Sí |
| Javier | `10.200.0.5` | Sí; sin handshake observado en la consulta actual | Sí |
| Milton | `10.200.0.6` | Sí; sin handshake observado en la consulta actual | Sí |
| Hugo | `10.200.0.7` | Sí; sin handshake observado en la consulta actual | No; falta su llave pública SSH |

Los cinco usuarios existentes pertenecen al grupo `sudo`. Un peer configurado sin handshake no demuestra que el perfil del cliente esté instalado o probado.

## 8. Política de seguridad

### 8.1 Perímetro

`edge-vpn` usa política `drop`. Permite SSH, WireGuard, tráfico establecido y el forwarding explícitamente requerido. Aplica masquerade para VPN, red privada y Visitantes.

### 8.2 Segmentación interna

Reglas relevantes de `core-app`:

- TI puede iniciar tráfico hacia las demás zonas;
- las demás zonas no pueden iniciar tráfico hacia TI;
- Operadores puede consultar Monitoreo por ICMP y `8080/TCP`;
- segmentos internos pueden usar DNS `.100`, NTP `.101` y LDAPS `.102`;
- redes autorizadas pueden acceder a la intranet `.116:80`;
- Visitantes puede salir a Internet mediante GRE/NAT;
- Visitantes no puede alcanzar redes RFC 1918, VPN ni intranet;
- tráfico originado en la red privada de Hetzner no entra libremente a `10.10.0.0/24`.

## 9. Validaciones realizadas

| Validación | Resultado |
|---|---|
| Reinicio de ambos servidores | Servicios, túnel, firewall y contenedores recuperados |
| Operadores → Monitoreo | Permitido |
| Operadores → TI | Bloqueado |
| TI → Operadores | Permitido |
| DNS interno → intranet | Resuelve `.116` |
| NTP | Estrato 8, estado normal |
| Bind LDAPS `ti-demo` | Correcto en prueba funcional |
| Operadores/Check-In → intranet | Permitido |
| Visitantes → Internet | Permitido |
| Visitantes → intranet/redes internas/VPN | Bloqueado |
| `core-app` → Internet usando tabla principal | Sin ruta predeterminada |

## 10. Código y archivos canónicos

| Ruta | Contenido |
|---|---|
| `fase-2/INFORME_FASE2.md` | Informe de red base y contenedores |
| `fase-3/informe/INFORME_FASE3.md` | Informe de servicios y seguridad |
| `fase-3/PLAN_IMPLEMENTACION_FASE3.md` | Plan técnico |
| `fase-3/ESTADO_IMPLEMENTACION_FASE3.md` | Registro de implementación |
| `fase-3/infra/docker-compose.yml` | Nueve contenedores actuales |
| `fase-3/infra/aeroquetzal-network.sh` | Bridges, GRE y policy routing |
| `fase-3/infra/aeroquetzal-container-net.sh` | Interfaces de contenedores |
| `fase-3/infra/nftables-core.conf` | ACL internas |
| `fase-3/infra/nftables-edge.conf` | Firewall y NAT perimetral |
| `fase-3/infra/intranet/` | Configuración y build estático actual |
| `fase-3/PRESENTACION_FASE3_AEROQUETZAL_REDISENADA.pptx` | Presentación editable |
| `fase-3/PRESENTACION_FASE3_AEROQUETZAL_REDISENADA.ppt` | Copia PowerPoint 97–2003 |

## 11. Pendientes reales

1. Migrar el diseño actual de “Aerolínea Redes” a la web pública de AeroQuetzal y abrir `80/443` únicamente cuando exista HTTPS y configuración revisada.
2. Sustituir el contenido temporal de `10.10.0.116` por una intranet nueva que reutilice el sistema visual, no el flujo público.
3. Crear API, persistencia de datos, autenticación LDAP y autorización por roles.
4. Definir usuarios/grupos LDAP definitivos.
5. Aplicar ACL por rol a los peers WireGuard.
6. Recibir la llave pública SSH de Hugo y crear su cuenta nominal.
7. Sustituir el texto heredado “Laboratorio 5” por identidad AeroQuetzal.
8. Agregar pruebas automáticas, health checks, backups de datos y procedimiento de despliegue.

## 12. Reglas para continuar sin dañar la infraestructura

- No agregar una ruta predeterminada a la tabla principal de `core-app`.
- No publicar la intranet mediante DNAT.
- No permitir acceso directo desde la web pública a LDAP o PostgreSQL.
- No activar `80/443` antes de desplegar y validar la web pública.
- No incluir `.env`, contraseñas, certificados privados o configuraciones WireGuard completas en Git.
- Mantener `network_mode: none` y conectar cada contenedor al bridge correcto.
- Probar siempre un flujo permitido y uno bloqueado después de cambiar ACL.
- Validar persistencia mediante reinicio controlado después de cambios de red o `systemd`.

## 13. Acceso operativo

Con WireGuard activo:

```bash
curl http://10.10.0.116
curl http://intranet.aeroquetzal.internal
```

Acceso SSH al perímetro:

```bash
ssh <usuario>@10.200.0.1
```

Acceso SSH al núcleo por su dirección privada, según rutas y ACL autorizadas:

```bash
ssh <usuario>@172.20.0.3
```

Las órdenes administrativas deben ejecutarse con la cuenta nominal de cada integrante y `sudo`, no compartiendo la llave de otro usuario.

