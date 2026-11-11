# Configuración desplegada de Fase 4

Estado: 10/11/2026. Estos archivos corresponden a cambios reales sobre las dos VM de AeroQuetzal. Las configuraciones previas y PostgreSQL tienen respaldo protegido en `/root/aq-phase4-backup/`; no hay claves privadas ni contraseñas en esta carpeta.

## Acceso

- Pública: `https://aeroquetzal.178.104.151.184.sslip.io`.
- Intranet por VPN: `https://intranet.aeroquetzal.internal`.
- Colector SNMP: en `core-app`, `sudo systemctl start aeroquetzal-snmp.service` y `sudo cat /var/lib/aeroquetzal-snmp/latest.json`.
- Panel gráfico desde TI: `http://snmp.aeroquetzal.internal:8080` (`10.10.0.53`).

Desde el Mac del administrador, mantener activa la VPN y ejecutar:

```bash
ssh -N -L 127.0.0.1:18088:10.10.0.53:8080 -i ~/.ssh/aeroquetzal_hetzner root@172.20.0.3
```

Después abrir `http://127.0.0.1:18088`. El panel continúa siendo exclusivo del segmento TI: el túnel SSH administrativo termina en el núcleo y su conexión al panel sale desde la interfaz TI `.49`. No se abre el puerto a todas las IP de WireGuard. Cerrar el túnel al terminar; para volver a abrirlo se usa el mismo comando.

## SNMP

Paquetes oficiales Ubuntu `snmp` y `snmpd`. En el bastión se descargan los `.deb`; el núcleo los recibe por transferencia SSH, sin salida a Internet. `configure-snmp.py edge` genera dos credenciales distintas en `/root/aq-phase4-secrets/`; esa carpeta se transfiere de forma protegida al núcleo antes de `configure-snmp.py core`. No se deben regenerar secretos sobre agentes ya configurados ni imprimir los JSON.

Los clientes se configuran en `/etc/aeroquetzal/snmp/edge/snmp.conf` y `/etc/aeroquetzal/snmp/core/snmp.conf`, con permisos 0600. Los agentes usan SNMPv3 SHA-256/AES, `authPriv`, usuario `aqmonitor` y vistas sólo de lectura. Escuchan en `172.20.0.2:161` y `10.10.0.49:161`, respectivamente. El único origen habilitado es `10.10.0.52`.

Instalar `snmp-collect.py` en `/usr/local/lib/aeroquetzal-phase4/` y sus unidades systemd en `/etc/systemd/system/`. El proceso usa el namespace de `ti01`, no una red con IP inventada. Instalar el drop-in `snmpd-edge.conf` o `snmpd-core.conf` en `/etc/systemd/system/snmpd.service.d/aeroquetzal.conf`, según la VM.

## Extra: panel gráfico SNMP exclusivo de TI

`install-snmp-panel.py` instala un panel propio y liviano en `/opt/aeroquetzal-snmp-panel`. El contenedor `aq-snmp-panel` utiliza la imagen Nginx existente, sin root, sin capacidades Linux, con raíz de sólo lectura y sin publicación de puertos del host. `snmp-panel-network.sh` lo conecta a `br-ti` con `10.10.0.53/28`, gateway `10.10.0.49`. Su timer recupera el enlace tras reinicios.

`snmp_panel.py` amplía el colector con tablas de interfaces y contadores de tráfico de 64 bits. Publica exclusivamente métricas sanitizadas en `/var/lib/aeroquetzal-snmp/panel/{metrics,history}.json`; ese directorio se monta en sólo lectura en el contenedor. Las credenciales SNMP no se montan ni se envían al navegador. El historial conserva hasta 48 horas / 2880 muestras, sobreviviendo reinicios. Las tasas se calculan sólo después de una segunda muestra y se invalidan cuando reinicia un agente.

Las ACL de nftables y Nginx permiten únicamente TI `10.10.0.48/28`; se bloquearon también el acceso directo desde VPN y la salida arbitraria iniciada por el panel. La interfaz contiene gráficas de carga, RAM usada sin caché, Mbps y estado de interfaces; mantiene el diseño base de AeroQuetzal y funciona en móvil sin dependencias externas. No se instalaron Grafana ni Prometheus.

Pruebas: `test_snmp_panel.py` valida conversión de datos, tasas, reinicios y retención; `verify-panel-acl.py` comprueba aislamiento desde los namespaces reales; `verify-panel.mjs` valida el navegador usando el túnel administrativo y datos reales. Las fuentes locales del panel incluyen sus licencias.

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

Se verificaron reinicios de contenedores/agentes, recarga de nftables y reinicios completos secuenciales de ambas VM. `verify-full-reboot.py` compara los boot ID, servicios, salud de contenedores, firmas de reservas/asientos e historial antes y después, y confirma acceso HTTPS y reserva persistida. El panel gráfico propio ya está implementado y accesible únicamente desde TI. Los resultados se conservan en los JSON de validación de la carpeta de fase.
