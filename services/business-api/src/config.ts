import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BUSINESS_HOST: z.string().default("127.0.0.1"),
  BUSINESS_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  AUTH_URL: z.url().default("http://127.0.0.1:8081"),
  AUTH_ORIGIN: z.url().default("http://127.0.0.1:5174"),
  PUBLIC_GATEWAY_TOKEN: z.string().default(""),
  TRUSTED_PROXIES: z.string().default(""),
}).superRefine((value, ctx) => {
  const auth = new URL(value.AUTH_URL);
  const origin = new URL(value.AUTH_ORIGIN);
  if (!["http:", "https:"].includes(auth.protocol) || auth.username || auth.password ||
      origin.origin !== value.AUTH_ORIGIN || !["http:", "https:"].includes(origin.protocol)) {
    ctx.addIssue({ code: "custom", message: "URLs de Auth inválidas" });
  }
  if (value.NODE_ENV === "production" &&
      (value.PUBLIC_GATEWAY_TOKEN.length < 32 || origin.protocol !== "https:")) {
    ctx.addIssue({ code: "custom", message: "Producción requiere token de gateway y HTTPS interno" });
  }
  if (value.TRUSTED_PROXIES.split(",").some((ip) => ["true", "*", "0.0.0.0/0", "::/0"].includes(ip.trim()))) {
    ctx.addIssue({ code: "custom", message: "Sólo se admiten proxies explícitos" });
  }
});

export type BusinessConfig = z.infer<typeof schema>;
export const readBusinessConfig = (env: NodeJS.ProcessEnv = process.env): BusinessConfig => schema.parse(env);
