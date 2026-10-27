import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AppRole } from "@aeroquetzal/domain";
import { anonymous, session } from "./fixtures";
import { deferred, json, mockApi, renderApp } from "./helpers";

describe("sesión y permisos", () => {
  it("protege el acceso directo sin consultar datos internos", async () => {
    const send = mockApi(anonymous);
    renderApp("/vuelos");
    await screen.findByRole("heading", { name: "Iniciar sesión" });
    expect(
      send.mock.calls.some(([path]) =>
        String(path).startsWith("/api/v1/internal"),
      ),
    ).toBe(false);
  });
  it.each([
    ["viewer", "/vuelos"],
    ["viewer", "/horarios"],
    ["viewer", "/disponibilidad"],
    ["viewer", "/reservas"],
    ["viewer", "/check-in"],
    ["operator", "/check-in"],
    ["operator", "/auditoria"],
    ["checkin_agent", "/vuelos"],
    ["checkin_agent", "/horarios"],
    ["checkin_agent", "/disponibilidad"],
    ["checkin_agent", "/auditoria"],
  ] as [AppRole, string][])(
    "%s no puede abrir %s ni dispara su API",
    async (role, path) => {
      const send = mockApi(session([role]));
      renderApp(path);
      await screen.findByRole("heading", { name: "Acceso denegado" });
      expect(
        send.mock.calls.some(([url]) =>
          String(url).startsWith("/api/v1/internal"),
        ),
      ).toBe(false);
    },
  );
  it.each(["admin", "operator", "checkin_agent", "viewer"] as AppRole[])(
    "%s puede consultar el panel",
    async (role) => {
      mockApi(session([role]));
      renderApp();
      await screen.findByText("Vuelos programados");
    },
  );
  it("combina roles y oculta navegación no permitida", async () => {
    mockApi(session(["operator", "viewer"]));
    renderApp();
    await screen.findByText("Vuelos programados");
    expect(screen.getByRole("link", { name: "Vuelos" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Auditoría" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Check-In" }),
    ).not.toBeInTheDocument();
  });
  it("inicia sesión, regresa a la ruta solicitada y cierra sesión con CSRF", async () => {
    const user = userEvent.setup();
    const send = mockApi(anonymous, (path, init) => {
      if (path.endsWith("/auth/login")) return json(session());
      if (path.endsWith("/auth/logout")) {
        expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe(
          "test-csrf-token",
        );
        return new Response(null, { status: 204 });
      }
      return undefined;
    });
    renderApp("/auditoria");
    await user.type(await screen.findByLabelText("Usuario"), "javier");
    await user.type(screen.getByLabelText("Contraseña"), "test-password");
    await user.click(
      screen.getByRole("button", { name: "Entrar a operaciones" }),
    );
    await screen.findByRole("heading", { name: "Historial de auditoría" });
    expect(
      send.mock.calls.find(([path]) =>
        String(path).endsWith("/auth/login"),
      )?.[1]?.credentials,
    ).toBe("same-origin");
    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    await screen.findByRole("heading", { name: "Iniciar sesión" });
    expect(
      send.mock.calls.some(([path]) => path === "/api/v1/auth/logout"),
    ).toBe(true);
  });
  it("muestra error de credenciales y vacía la contraseña", async () => {
    const user = userEvent.setup();
    mockApi(anonymous, (path) =>
      path.endsWith("/auth/login")
        ? json(
            {
              code: "INVALID_CREDENTIALS",
              message: "Usuario o contraseña incorrectos",
            },
            401,
          )
        : undefined,
    );
    renderApp("/login");
    await user.type(await screen.findByLabelText("Usuario"), "javier");
    await user.type(screen.getByLabelText("Contraseña"), "wrong");
    await user.click(
      screen.getByRole("button", { name: "Entrar a operaciones" }),
    );
    await screen.findByText("Usuario o contraseña incorrectos");
    expect(screen.getByLabelText("Contraseña")).toHaveValue("");
  });
  it("bloquea revalidaciones por foco durante logout y descarta respuestas tardías", async () => {
    const closing = deferred<Response>();
    const lateSession = deferred<Response>();
    let reads = 0;
    mockApi(session(), (path) => {
      if (path.endsWith("/logout")) return closing.promise;
      if (path.endsWith("/session") && ++reads > 1) return lateSession.promise;
      return undefined;
    });
    renderApp("/check-in");
    await userEvent.click(
      await screen.findByRole("button", { name: "Cerrar sesión" }),
    );
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await act(async () => {
      closing.resolve(new Response(null, { status: 204 }));
    });
    await screen.findByRole("heading", { name: "Iniciar sesión" });
    await act(async () => {
      lateSession.resolve(json(session()));
    });
    expect(
      screen.getByRole("heading", { name: "Iniciar sesión" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(reads).toBe(1);
  });
  it("ignora una revalidación iniciada antes de cerrar la sesión", async () => {
    const lateSession = deferred<Response>();
    let reads = 0;
    mockApi(session(), (path) => {
      if (path.endsWith("/logout")) return new Response(null, { status: 204 });
      if (path.endsWith("/session") && ++reads > 1) return lateSession.promise;
      return undefined;
    });
    renderApp("/check-in");
    await screen.findByRole("button", { name: "Cerrar sesión" });
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Cerrar sesión" }),
    );
    await screen.findByRole("heading", { name: "Iniciar sesión" });
    await act(async () => {
      lateSession.resolve(json(session()));
    });
    expect(
      screen.getByRole("heading", { name: "Iniciar sesión" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
  it("permite reintentar logout si falla el servicio", async () => {
    let attempts = 0;
    mockApi(session(), (path) =>
      path.endsWith("/logout")
        ? ++attempts === 1
          ? json(
              { code: "UNAVAILABLE", message: "No se pudo cerrar la sesión" },
              503,
            )
          : new Response(null, { status: 204 })
        : undefined,
    );
    renderApp("/check-in");
    await userEvent.click(
      await screen.findByRole("button", { name: "Cerrar sesión" }),
    );
    await screen.findByText("No se pudo cerrar la sesión");
    await userEvent.click(
      screen.getByRole("button", { name: "Cerrar sesión" }),
    );
    await screen.findByRole("heading", { name: "Iniciar sesión" });
    expect(attempts).toBe(2);
  });
  it("retira datos privados y vuelve al login cuando la API devuelve 401", async () => {
    mockApi(session(), (path) =>
      path.endsWith("/dashboard") ? json({}, 401) : undefined,
    );
    renderApp();
    await screen.findByRole("heading", { name: "Iniciar sesión" });
    expect(
      screen.getByText("La sesión terminó. Inicia sesión para continuar."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
  it("revalida al vencer la sesión sin mantenerla activa con polling", async () => {
    vi.useFakeTimers();
    try {
      let reads = 0;
      const current = {
        ...session(),
        expiresAt: new Date(Date.now() + 1000).toISOString(),
      };
      mockApi(current, (path) =>
        path.endsWith("/session")
          ? json(reads++ === 0 ? current : anonymous)
          : undefined,
      );
      await act(async () => {
        renderApp();
      });
      expect(screen.getByText("Vuelos programados")).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1100);
      });
      expect(
        screen.getByRole("heading", { name: "Iniciar sesión" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("La sesión terminó. Inicia sesión para continuar."),
      ).toBeInTheDocument();
      expect(reads).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it("permite reintentar una sesión inaccesible sin mostrar pantallas privadas", async () => {
    let failed = true;
    mockApi(session(), (path) =>
      path.endsWith("/session") && failed ? json({}, 503) : undefined,
    );
    renderApp("/vuelos");
    await screen.findByRole("button", { name: "Reintentar" });
    failed = false;
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() =>
      expect(
        screen.getByRole("table", { name: "Catálogo de vuelos" }),
      ).toBeInTheDocument(),
    );
  });
});
