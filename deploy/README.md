# Despliegue integrado de AeroQuetzal

Esta entrega contiene imágenes separadas para API/Auth, migración, web pública/gateway e intranet. La API utiliza PostgreSQL real; no se despliegan las fixtures de Playwright. Los secretos y artefactos están excluidos de Git y del contexto Docker.

## Destinos y requisitos

| Servicio | Destino | Acceso |
|---|---|---|
| Pública y gateway | `edge-vpn`, `178.104.151.184:443` | Internet, sólo endpoints públicos permitidos |
| API | `core-app`, `10.10.0.103:8080` | Gateway autenticado, proxy interno y TI |
| PostgreSQL | `core-app`, `10.10.0.104:5432` | API y administración TI |
| Auth | `core-app`, `10.10.0.105:8081` | API y proxy interno |
| Intranet | `core-app`, `10.10.0.116:443` | Redes de empleados y WireGuard; sesión/rol para datos |

`.105` es una nueva reserva para Auth. Antes de asignar `.103–.105`, comprobar que estén libres y actualizar DNS/ACL. Se conservan los bridges existentes, `network_mode: none`, WireGuard, LDAP, volúmenes y política de salida de Visitantes. No agregar una ruta por defecto a `core-app` ni publicar puertos internos con Docker.

Se requiere acceso SSH nominal del integrante autorizado y sudo en ambos servidores. La activación del 29/10/2026 se realizó con la cuenta nominal de Ian. Los archivos actuales de `/opt/aeroquetzal`, `/usr/local/sbin` y `/etc/nftables.conf` deben respaldarse antes del cambio. Consulta [el estado comprobado](ESTADO_2026-10-29.md).

## Validar y construir

```bash
npm ci
npm run lint
npm run typecheck
# TEST_DATABASE_URL apunta exclusivamente a una base terminada en _test.
DATABASE_URL="$TEST_DATABASE_URL" npm run prisma:migrate:deploy --workspace @aeroquetzal/database
npm test
npm run test:e2e:public
npm run test:e2e:internal
npm run test:e2e:integrated
python3 deploy/test-compose.py
deploy/test-gateway.sh
```

`typecheck` compila primero dominio, contratos, base de datos y Auth mediante `build:shared`. Esto permite ejecutar la misma secuencia en un checkout limpio de CI sin depender de archivos `dist` de una ejecución anterior.

En Windows, inicia Docker Desktop y usa Git Bash para `test-gateway.sh`. Si Python sólo está disponible como `python`, ejecuta `PYTHON=python bash deploy/test-gateway.sh`. La prueba convierte las rutas de montaje de Windows y evita que MSYS reescriba las rutas internas del contenedor. Sus certificados y su token son desechables y exclusivos de esta prueba.

Después de guardar y publicar el commit completo en `main`:

```bash
git pull --ff-only origin main
RELEASE="$(git rev-parse --short=12 HEAD)" deploy/build-images.sh
```

El script construye para Linux amd64 y exporta cuatro imágenes propias y PostgreSQL en `deploy/artifacts/images-<release>.tar.gz`. Transferir el código y las imágenes al servidor con la cuenta nominal; ejecutar `docker load` allí. `core-app` recibe las imágenes desde el bastión o la estación de trabajo, sin habilitar salida general a Internet. Si el checkout de `core-app` no puede contactar GitHub, actualizar `main` con un bundle del commit publicado y `git pull --ff-only <bundle> main`.

## Secretos y certificados

`python3 deploy/init-secrets.py --public-host <dominio-o-IP>` genera credenciales aleatorias nuevas, con permisos 0600, y rechaza sobrescribir secretos existentes. Copiar al núcleo únicamente `auth.env`, `business.env` y `postgres_password`; al perímetro únicamente `public.env`. Ambos deben compartir el mismo token de gateway. Los valores reales nunca se muestran ni se guardan en documentos.

Preparar además:

- `deploy/secrets/ldap-ca.pem`: CA pública del LDAPS existente; la URL debe coincidir con el SAN del certificado. No desactivar la validación TLS.
- `deploy/secrets/internal-tls/{fullchain.pem,privkey.pem}`: certificado válido para `intranet.aeroquetzal.internal`; distribuir su CA a los equipos autorizados.
- `deploy/secrets/public-tls/{fullchain.pem,privkey.pem}`: certificado públicamente confiable para el host público, con renovación automática y recarga de Nginx. No reutilizar los certificados desechables de `test-gateway.sh`.

Si no se dispone de dominio, Let's Encrypt admite certificados para IP, de corta duración. Certbot >=5.4 permite `--ip-address <IP> --preferred-profile shortlived --webroot`; requiere automatizar la renovación y validar la cadena públicamente. Véase la [instrucción oficial](https://letsencrypt.org/2026/03/11/shorter-certs-certbot/). Durante la obtención, publicar en HTTP únicamente el challenge; no aceptar datos de pasajeros hasta disponer de HTTPS válido.

En el despliegue actual, Certbot oficial `v5.9.0` conserva su estado en `/etc/aeroquetzal-web/letsencrypt`, usa el volumen `aeroquetzal-public_acme` para el challenge y emite el certificado llamado `aeroquetzal-public-ip`. `renew-public-tls.sh` renueva, verifica cadena/IP/caducidad y coincidencia de la clave, instala los PEM y recarga Nginx. El contenedor Certbot no recibe el socket Docker ni secretos de la aplicación. El timer revisa cada seis horas:

```bash
sudo install -d -m 0755 /usr/local/lib/aeroquetzal-web
sudo install -m 0755 deploy/renew-public-tls.sh /usr/local/lib/aeroquetzal-web/
sudo install -m 0644 deploy/aeroquetzal-public-tls.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now aeroquetzal-public-tls.timer
sudo systemctl start aeroquetzal-public-tls.service
```

Para emitir inicialmente, mantener un servidor HTTP que sirva únicamente el challenge del mismo volumen, crear los directorios de estado con permisos 0700 y ejecutar:

```bash
sudo docker run --rm --network host \
  -v /etc/aeroquetzal-web/letsencrypt:/etc/letsencrypt \
  -v /var/lib/aeroquetzal-web/certbot:/var/lib/letsencrypt \
  -v /var/log/aeroquetzal-web/certbot:/var/log/letsencrypt \
  -v aeroquetzal-public_acme:/var/www/acme \
  certbot/certbot:v5.9.0 certonly --non-interactive --agree-tos --register-unsafely-without-email \
  --preferred-profile shortlived --webroot -w /var/www/acme \
  --ip-address 178.104.151.184 --cert-name aeroquetzal-public-ip
sudo deploy/renew-public-tls.sh install
```

Para TLS interno, `sudo deploy/init-internal-tls.sh` genera una CA privada y un certificado con SAN de nombre/IP, restricciones y usos de clave. Rechaza sobrescribir un certificado existente; `--replace` guarda antes una copia. La clave de la CA permanece en `/etc/aeroquetzal-web/internal-ca/ca.key`, fuera del checkout y de los mounts. Distribuir sólo `deploy/secrets/internal-ca.pem` a los clientes autorizados. No usar `-k`, desactivar validación TLS ni distribuir claves privadas.

## Integración con la infraestructura existente

El inventario leído en Hetzner el 29/10/2026 confirma los bridges `br-servicios` y `br-dmz`, la web anterior en el servicio `intranet` de `/opt/aeroquetzal/docker-compose.yml`, y su montaje `/opt/aeroquetzal/intranet/site`. La cuenta `nery` pertenece a sudo; Docker requiere privilegios administrativos.

Cambios acotados que deben revisarse antes de aplicar:

0. En `edge-vpn`, comprobar la ruta `10.10.0.0/24` por `172.20.0.1` en `enp7s0`, persistida con `aeroquetzal-public-route.service`. Ya estaba corregida al activar esta versión. Esto no cambia la ruta por defecto del núcleo.
1. En el firewall de `core-app`, insertar la excepción `172.20.0.2 → 10.10.0.103:8080` **antes** del bloqueo general Hetzner → redes internas. Permitir `.116 → .103:8080/.105:8081`, `.103 → .104:5432/.105:8081`, y HTTPS hacia `.116` desde empleados/VPN. Conservar los bloqueos de Visitantes.
2. Integrar `firewall-guard.nft` en la carga persistente de nftables. Sus cadenas restringen tráfico; no sustituyen los permisos anteriores ni el firewall existente. Su tabla bridge impide el acceso lateral no autorizado a PostgreSQL/Auth. Validar con `nft -c -f` y probar tanto flujos aceptados como rechazados.
3. Añadir DNS interno para API `.103`, PostgreSQL `.104` y Auth `.105`; conservar el registro de intranet `.116`.
4. En el perímetro, autorizar `80/443` sólo hacia la pública, incluidos los controles del firewall de Hetzner. `prepare-firewall.py edge` incluye el acceso de Visitantes por GRE únicamente a la IP pública en esos puertos. No crear DNAT hacia intranet, LDAP, Auth ni PostgreSQL.
5. Retirar sólo el servicio viejo `intranet` del Compose base y su última llamada `attach_static intranet ...` de `aeroquetzal-container-net.sh`. Así no reaparece al reiniciar. Los otros ocho servicios mantienen su configuración.
6. Detener y retirar el contenedor viejo, respaldar su configuración/archivos y cambiar a la nueva imagen. No borrar `nginx:1.27-alpine`: **Monitoreo comparte esa imagen**. No usar `docker system prune` ni `docker compose down -v`.
7. Comprobar MAC distintas en DNS/NTP/LDAP. Se encontró una MAC duplicada en los tres peers antiguos. `sudo deploy/repair-service-macs.sh` respalda y corrige el script de arranque, asigna MAC únicas a esos tres servicios y retira sólo sus vecinos ARP antiguos, sin reiniciarlos.

`attach-network.sh` conecta sólo los nuevos contenedores a los bridges ya existentes. `aeroquetzal-web-network.service` repone las conexiones tras reinicios de Docker o contenedores, sin modificar interfaces ni rutas del host.

## Activación

Con ACL, certificados, secretos, DNS y sustitución de la web anterior preparados:

```bash
# En core-app, desde el checkout publicado:
sudo RELEASE=<commit> SEED_DATABASE=1 SEED_BASE_DATE=<fecha-acordada> deploy/release.sh core
sudo RELEASE=<commit> deploy/release.sh internal
# En edge-vpn:
sudo RELEASE=<commit> deploy/release.sh public
```

`release.sh` valida Compose, aplica migraciones con una imagen dedicada y exige health de PostgreSQL a través de la API. La semilla requiere una decisión explícita; las actualizaciones normales no reescriben catálogos. Los proxies validan la configuración antes de cambiar. No se publican versiones parciales durante los turnos de otros integrantes.

## Verificación y rollback

Después de desplegar: comprobar health de API/PostgreSQL/Auth; buscar y reservar desde Internet por HTTPS; consultar desde la intranet con un usuario LDAP de Check-In; completar Check-In y ver asiento/auditoría; comprobar 401 anónimo, 403 por rol y bloqueo CSRF; verificar que el gateway rechaza Auth y endpoints internos. Repetir desde Operadores/Check-In/TI/Monitoreo y Visitantes: empleados acceden a intranet, Visitantes sólo a Internet. Comprobar que PostgreSQL y LDAP no estén publicados, que no se sirva “Laboratorio 5” y que un reinicio controlado conserve servicios y reservas.

`sudo deploy/verify-core.sh` automatiza las comprobaciones de lectura desde los namespaces reales: health, ausencia de puertos publicados, HTTPS con CA, 401/403, bloqueos TCP, DNS, LDAPS desde Node y salida pública de Visitantes. No crea reservas ni cuentas. Para probar la renovación sin instalar certificados de staging, repetir el comando Docker de Certbot con `renew --cert-name aeroquetzal-public-ip --dry-run --non-interactive --no-random-sleep-on-renew`.

Antes del cambio guardar el commit, etiquetas de imágenes, configuración, mounts y backup PostgreSQL de la versión anterior. Si falla una release, cerrar primero el acceso público, volver al checkout/etiquetas previas y ejecutar el mismo Compose conservando `aeroquetzal_postgres_data`. La migración inicial es aditiva; no ejecutar migraciones inversas ni borrar volúmenes automáticamente. Una restauración de datos usa los scripts de Milton y requiere confirmar el backup concreto. La copia de la web temporal se mantiene fuera de las rutas servidas, sólo para recuperación, y se elimina cuando la validación final queda aprobada.

Validación local realizada: lint/typecheck/build, pruebas de módulos con PostgreSQL, 12 recorridos Playwright, gateway Nginx real, backup/restauración en una base aislada y persistencia de una reserva tras reiniciar el contenedor de producción. Estas comprobaciones no sustituyen las pruebas de LDAPS, firewall y reinicio en Hetzner.
