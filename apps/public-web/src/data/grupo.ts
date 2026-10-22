export const dominio = "aerolinea.redes.test"

export const servicios = [
  { nombre: "DNS", host: `ns1.${dominio}`, software: "BIND9", puerto: "53" },
  { nombre: "Directorio", host: `ldap.${dominio}`, software: "OpenLDAP", puerto: "389" },
  { nombre: "Web", host: `www.${dominio}`, software: "Apache", puerto: "80" },
  { nombre: "Correo", host: `mail.${dominio}`, software: "Postfix + Dovecot", puerto: "25 / 143" },
  { nombre: "Archivos", host: `ftp.${dominio}`, software: "vsftpd", puerto: "21" },
]
