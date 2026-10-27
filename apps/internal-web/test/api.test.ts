import { describe, expect, it, vi } from "vitest";
import { createApi, ApiError } from "../src/api";
import { flight, instance, session } from "./fixtures";
import { json } from "./helpers";

describe("cliente HTTP interno", () => {
  it("valida el contrato, usa el mismo origen y adjunta CSRF a los cambios", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(json(flight));
    const api = createApi({
      fetch: send,
      csrfToken: () => "csrf",
      onUnauthorized: vi.fn(),
    });
    await api.updateFlight("flight/1", { active: false });
    const [path, init] = send.mock.calls[0]!;
    expect(path).toBe("/api/v1/internal/flights/flight%2F1");
    expect(init).toMatchObject({
      method: "PATCH",
      credentials: "same-origin",
      cache: "no-store",
      body: '{"active":false}',
    });
    expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe("csrf");
  });
  it("login no requiere CSRF y 401 de credenciales no invalida otra sesión", async () => {
    const expired = vi.fn();
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        json(
          { code: "INVALID_CREDENTIALS", message: "Credenciales inválidas" },
          401,
        ),
      );
    const api = createApi({
      fetch: send,
      csrfToken: () => null,
      onUnauthorized: expired,
    });
    await expect(
      api.login({ username: "javier", password: "wrong" }),
    ).rejects.toMatchObject({ status: 401 });
    expect(expired).not.toHaveBeenCalled();
    expect(
      new Headers(send.mock.calls[0]![1]?.headers).has("X-CSRF-Token"),
    ).toBe(false);
  });
  it("no envía operaciones sin token ni datos inválidos", async () => {
    const send = vi.fn<typeof fetch>();
    const api = createApi({
      fetch: send,
      csrfToken: () => null,
      onUnauthorized: vi.fn(),
    });
    await expect(api.logout()).rejects.toMatchObject({ code: "MISSING_CSRF" });
    expect(() => api.reservations(" ")).toThrow();
    expect(() => api.createFlight({ ...flight, destination: "GUA" })).toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it("invalida sesión en 401 de API y conserva los errores 403", async () => {
    const expired = vi.fn();
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({}, 403));
    const api = createApi({
      fetch: send,
      csrfToken: () => "csrf",
      onUnauthorized: expired,
    });
    await expect(api.dashboard()).rejects.toMatchObject({ status: 401 });
    await expect(api.audit()).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalledTimes(1);
  });
  it("rechaza respuestas inválidas e inventarios inconsistentes", async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("<html>error</html>"))
      .mockResolvedValueOnce(json([{ ...instance, availableSeats: 200 }]));
    const api = createApi({
      fetch: send,
      csrfToken: () => null,
      onUnauthorized: vi.fn(),
    });
    await expect(api.session()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
    await expect(api.instances()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
  it("acepta logout 204 y reenvía cancelación de lecturas", async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json(session()));
    const api = createApi({
      fetch: send,
      csrfToken: () => "csrf",
      onUnauthorized: vi.fn(),
    });
    await expect(api.logout()).resolves.toBeUndefined();
    const controller = new AbortController();
    await api.session(controller.signal);
    expect(send.mock.calls[1]![1]?.signal).toBe(controller.signal);
  });
  it("una respuesta antigua no cierra una sesión nueva ni una lectura cancelada", async () => {
    let token = "old";
    const expired = vi.fn();
    let finish: (response: Response) => void = () => {};
    const send = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const api = createApi({
      fetch: send,
      csrfToken: () => token,
      onUnauthorized: expired,
    });
    const pending = api.dashboard();
    token = "new";
    finish(json({}, 401));
    await expect(pending).rejects.toMatchObject({ status: 401 });
    const controller = new AbortController();
    const cancelled = api.dashboard(controller.signal);
    controller.abort();
    finish(json({}, 401));
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    expect(expired).not.toHaveBeenCalled();
  });
});
