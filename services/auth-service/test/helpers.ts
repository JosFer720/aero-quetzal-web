import { readConfig, type AuthConfig } from "../src/config.js";
import { MockDirectory } from "../src/ldap.js";

export function testConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    ...readConfig({
      NODE_ENV: "test",
      SESSION_SECRET: "test-only-session-secret-with-more-than-32-characters",
      AUTH_ORIGIN: "http://localhost:5174",
    }),
    ...overrides,
  };
}

export function testDirectory() {
  return new MockDirectory({
    hugo: { password: "test-password", displayName: "Hugo", groups: ["ti"] },
    operator: { password: "test-password", displayName: "Operador", groups: ["operadores"] },
    checkin: { password: "test-password", displayName: "Agente", groups: ["checkin"] },
    viewer: { password: "test-password", displayName: "Monitor", groups: ["monitoreo"] },
    outsider: { password: "test-password", displayName: "Sin rol", groups: ["visitantes"] },
  });
}

export function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const value = response.headers["set-cookie"];
  const cookie = Array.isArray(value) ? value[0] : value;
  return String(cookie).split(";")[0]!;
}
