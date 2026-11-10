# Configuración desplegada de Fase 4

Estado: 10/11/2026. Estos archivos corresponden a cambios reales sobre las dos VM de AeroQuetzal. Las configuraciones previas y PostgreSQL tienen respaldo protegido en `/root/aq-phase4-backup/`; no hay claves privadas ni contraseñas en esta carpeta.

## Acceso

- Pública: `https://aeroquetzal.178.104.151.184.sslip.io`.
- Intranet por VPN: `https://intranet.aeroquetzal.internal`.
- Colector SNMP: en `core-app`, `sudo systemctl start aeroquetzal-snmp.service` y `sudo cat /var/lib/aeroquetzal-snmp/latest.json`.

## SNMP

Paquetes oficiales Ubuntu `snmp` y `snmpd`. En el bastión se descargan los `.deb`; el núcleo los recibe por transferencia SSH, sin salida a Internet. `configure-snmp.py edge` genera dos credenciales distintas en `/root/aq-phase4-secrets/`; esa carpeta se transfiere de forma protegida al núcleo antes de `configure-snmp.py core`. No se deben regenerar secretos sobre agentes ya configurados ni imprimir los JSON.

Los clientes se configuran en `/etc/aeroquetzal/snmp/edge/snmp.conf` y `/etc/aeroquetzal/snmp/core/snmp.conf`, con permisos 0600. Los agentes usan SNMPv3 SHA-256/AES, `authPriv`, usuario `aqmonitor` y vistas sólo de lectura. Escuchan en `172.20.0.2:161` y `10.10.0.49:161`, respectivamente. El único origen habilitado es `10.10.0.52`.

Instalar `snmp-collect.py` en `/usr/local/lib/aeroquetzal-phase4/` y sus unidades systemd en `/etc/systemd/system/`. El proceso usa el namespace de `ti01`, no una red con IP inventada. Instalar el drop-in `snmpd-edge.conf` o `snmpd-core.conf` en `/etc/systemd/system/snmpd.service.d/aeroquetzal.conf`, según la VM.

## DMZ, dominio y certificados

El contenedor público usa la imagen estable anterior, pero su red es `none`; `public-dmz.sh` lo conecta a `br-public-dmz`, con IP `10.10.1.4/28` y gateway `10.10.1.1`. Su timer recompone la interfaz después de reinicios. `configure-firewall.py edge` permite solamente la salida TCP 8080 a la API, aplica SNAT a `172.20.0.2` y DNAT público 80/443. Los scripts preservan reglas anteriores y validan la configuración antes de persistirla.

`activate-public.py` cambia únicamente el Compose/plantilla/env públicos y guarda sus versiones anteriores. No contiene tokens: conserva los valores reales existentes. `public.conf.template` distingue el certificado de la IP del certificado del nuevo dominio. HTTP e IP HTTPS redirigen al dominio; el gateway sólo publica las rutas públicas autorizadas.

El certificado se emitió con el contenedor oficial `certbot/certbot:v5.9.0`, validación HTTP-01 y nombre de certificado `aeroquetzal-public-domain`. Su estado permanece en `/etc/aeroquetzal-web/letsencrypt`; la renovación diaria copia el material validado a `/opt/aeroquetzal-web/deploy/secrets/public-domain-tls` y recarga Nginx. No incluir esos directorios en Git.

## API y datos

La corrección de negocio está en el commit `1bcd21637d9077e828de72cc9f54e1e9b966e48d`. La imagen activa es `aeroquetzal/server:phase4-1bcd216`, derivada de `aeroquetzal/server:09b6ced445a8` mediante `Dockerfile.api-patch`. Su contexto mínimo contiene `service.js`, `service.js.map` compilados desde ese commit y `service.ts`. No se necesitan secretos ni Internet para construir esa capa si la imagen base ya está cargada.

`activate-api.py` verifica backup e imagen y cambia sólo la referencia de `business-api`. No modifica Auth, PostgreSQL, LDAP ni sus datos.

`seed-upcoming.mjs` se ejecuta en `/workspace/seed-upcoming.mjs` dentro de la API y agrega 14 días futuros mediante `BusinessService.createInstance`. Detecta salidas existentes y no sobrescribe reservas ni horarios anteriores. El 10/11/2026 agregó 56 salidas para el 11–24/11/2026.

## Rutas y DNS dividido

El servicio existente `aeroquetzal-public-route.service` repone `10.10.0.0/24 via 172.20.0.1 dev enp7s0`. Instalar `route-resilience.conf` como drop-in y habilitar `aeroquetzal-public-route.timer` para recuperarla tras cambios DHCP.

En macOS, `aeroquetzal.internal.resolver` se instala en `/etc/resolver/aeroquetzal.internal`. Esto envía solamente el dominio interno a `10.10.0.100`; no configurar ese servidor como único DNS general del perfil WireGuard. La CA interna se importa por el mecanismo normal de autorización del llavero para el nombre de la intranet.

## Pruebas y límites

- `verify-network.py edge|core`: usar en la VM correspondiente para validar flujos desde namespaces reales.
- `verify-business.py`: ejecutar desde el Mac con VPN, DNS dividido y CA disponibles; crea dos reservas ficticias auditables, una cancelada y otra con Check-In. Lee la contraseña LDAP de su archivo específico por SSH sin imprimirla.
- `verify-persistence.py`: reutiliza el resultado anterior para comprobar la reserva/asiento después de reiniciar servicios; no crea nuevas reservas.
- Los scripts de pruebas del Mac usan las rutas de esta instalación. En otro equipo se deben adaptar las rutas de identidad SSH y certificado público, sin copiar claves privadas al repositorio.

Se verificaron reinicios de los nuevos contenedores, agentes y recarga de nftables; no se reiniciaron completamente las VM. No se instaló el panel gráfico SNMP opcional.
