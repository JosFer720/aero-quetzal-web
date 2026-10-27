import { z } from "zod";

const seconds = z.coerce.number().int().positive().max(86400);

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  AUTH_HOST: z.string().min(1).default("127.0.0.1"),
  AUTH_PORT: z.coerce.number().int().min(1).max(65535).default(8081),
  AUTH_ORIGIN: z.url().default("http://localhost:5174"),
  AUTH_MODE: z.enum(["ldap", "mock"]).default("ldap"),
  LDAP_URL: z.url().default("ldaps://10.10.0.102:636"),
  LDAP_BASE_DN: z.string().min(1).default("dc=aeroquetzal,dc=internal"),
  LDAP_PEOPLE_OU: z.string().min(1).default("ou=People"),
  LDAP_GROUPS_OU: z.string().min(1).default("ou=Groups"),
  LDAP_TIMEOUT_MS: z.coerce.number().int().positive().max(30000).default(5000),
  SESSION_SECRET: z.string().min(32).refine(
    (value) => value !== "replace-with-secret-manager-value",
    "Debe configurarse un secreto aleatorio",
  ),
  SESSION_IDLE_SECONDS: seconds.default(1800),
  SESSION_MAX_SECONDS: seconds.default(28800),
  SESSION_ROTATION_SECONDS: seconds.default(900),
}).superRefine((config, ctx) => {
  const origin = new URL(config.AUTH_ORIGIN);
  if (origin.origin !== config.AUTH_ORIGIN || !["http:", "https:"].includes(origin.protocol)) {
    ctx.addIssue({ code: "custom", path: ["AUTH_ORIGIN"], message: "Debe ser un origen HTTP sin ruta" });
  }
  const ldap = new URL(config.LDAP_URL);
  if (ldap.protocol !== "ldaps:" || ldap.username || ldap.password) {
    ctx.addIssue({ code: "custom", path: ["LDAP_URL"], message: "Se requiere LDAPS sin credenciales en la URL" });
  }
  if (config.NODE_ENV === "production" && (origin.protocol !== "https:" || config.AUTH_MODE !== "ldap")) {
    ctx.addIssue({ code: "custom", message: "Producción requiere HTTPS y LDAP real" });
  }
  if (config.SESSION_ROTATION_SECONDS >= config.SESSION_IDLE_SECONDS ||
      config.SESSION_IDLE_SECONDS > config.SESSION_MAX_SECONDS) {
    ctx.addIssue({ code: "custom", message: "Rotación < inactividad <= duración máxima" });
  }
});

export type AuthConfig = z.infer<typeof configSchema>;

export function readConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Configuración Auth inválida: ${result.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    ).join("; ")}`);
  }
  return result.data;
}
