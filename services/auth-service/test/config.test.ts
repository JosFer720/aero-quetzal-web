import { describe, expect, it } from "vitest";

import { readConfig } from "../src/config.js";

const env = {
  NODE_ENV: "production",
  AUTH_ORIGIN: "https://intranet.example",
  SESSION_SECRET: "test-only-session-secret-with-more-than-32-characters",
};

describe("configuración segura", () => {
  it("usa LDAPS y límites de sesión predeterminados", () => {
    expect(readConfig(env)).toMatchObject({
      LDAP_URL: "ldaps://10.10.0.102:636",
      AUTH_MODE: "ldap",
      SESSION_IDLE_SECONDS: 1800,
    });
  });

  it.each([
    { SESSION_SECRET: "short" },
    { SESSION_SECRET: "replace-with-secret-manager-value" },
    { LDAP_URL: "ldap://10.10.0.102:389" },
    { LDAP_URL: "ldaps://user:password@10.10.0.102:636" },
    { AUTH_ORIGIN: "http://intranet.example" },
    { AUTH_ORIGIN: "https://intranet.example/path" },
    { AUTH_MODE: "mock" },
    { SESSION_ROTATION_SECONDS: "1800" },
    { SESSION_MAX_SECONDS: "900" },
  ])("rechaza configuración insegura: %j", (override) => {
    expect(() => readConfig({ ...env, ...override })).toThrow();
  });
});
