import { Client, InvalidCredentialsError } from "ldapts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DirectoryUnavailableError, escapeFilter, LdapDirectory, mapIdentity } from "../src/ldap.js";
import { testConfig } from "./helpers.js";

afterEach(() => { vi.restoreAllMocks(); });

describe("adaptador LDAP", () => {
  it("realiza bind del usuario y consulta grupos con membresía explícita", async () => {
    const bind = vi.spyOn(Client.prototype, "bind").mockResolvedValue();
    const search = vi.spyOn(Client.prototype, "search")
      .mockResolvedValueOnce({ searchEntries: [{ dn: "user", displayName: "Hugo" }], searchReferences: [] })
      .mockResolvedValueOnce({
        searchEntries: [{ dn: "group", cn: "ti" }, { dn: "group2", cn: ["monitoreo"] }],
        searchReferences: [],
      });
    const unbind = vi.spyOn(Client.prototype, "unbind").mockResolvedValue();
    const result = await new LdapDirectory(testConfig()).authenticate("hugo", "test-password");
    expect(bind).toHaveBeenCalledWith("uid=hugo,ou=People,dc=aeroquetzal,dc=internal", "test-password");
    expect(search).toHaveBeenLastCalledWith("ou=Groups,dc=aeroquetzal,dc=internal", expect.objectContaining({
      scope: "one",
      filter: "(|(member=uid=hugo,ou=People,dc=aeroquetzal,dc=internal)(uniqueMember=uid=hugo,ou=People,dc=aeroquetzal,dc=internal)(memberUid=hugo))",
    }));
    expect(result).toEqual({ username: "hugo", displayName: "Hugo", groups: ["ti", "monitoreo"] });
    expect(unbind).toHaveBeenCalledOnce();
  });

  it("distingue credenciales inválidas de fallos del directorio y siempre cierra la conexión", async () => {
    const bind = vi.spyOn(Client.prototype, "bind").mockRejectedValue(new InvalidCredentialsError());
    const unbind = vi.spyOn(Client.prototype, "unbind").mockResolvedValue();
    const directory = new LdapDirectory(testConfig());
    expect(await directory.authenticate("hugo", "wrong")).toBeNull();
    bind.mockRejectedValue(new Error("connection refused"));
    await expect(directory.authenticate("hugo", "test-password")).rejects.toBeInstanceOf(DirectoryUnavailableError);
    expect(unbind).toHaveBeenCalledTimes(2);
  });

  it.each(["hugo,cn=ti", "*", "hugo)(uid=*)", "hugo\\00", "hugo\u0000"])(
    "rechaza inyección LDAP antes de abrir una conexión: %s", async (username) => {
      const bind = vi.spyOn(Client.prototype, "bind");
      expect(await new LdapDirectory(testConfig()).authenticate(username, "test-password")).toBeNull();
      expect(bind).not.toHaveBeenCalled();
    },
  );

  it("no permite bind anónimo con contraseña vacía", async () => {
    const bind = vi.spyOn(Client.prototype, "bind");
    expect(await new LdapDirectory(testConfig()).authenticate("hugo", "")).toBeNull();
    expect(bind).not.toHaveBeenCalled();
  });

  it("escapa caracteres especiales de filtros", () => {
    expect(escapeFilter("a*(b)\\\0")).toBe("a\\2a\\28b\\29\\5c\\00");
  });

  it("mapea únicamente los cuatro grupos acordados, sin duplicar roles", () => {
    expect(mapIdentity({
      username: "hugo", displayName: "Hugo",
      groups: ["TI", "ti", "operadores", "checkin", "monitoreo", "admin", "__proto__", "constructor"],
    })?.roles).toEqual(["admin", "operator", "checkin_agent", "viewer"]);
    expect(mapIdentity({ username: "guest", displayName: "Guest", groups: ["visitantes"] })).toBeNull();
  });
});
