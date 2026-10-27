import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { flight, instance, reservation, session } from "./fixtures";
import { json, mockApi, renderApp } from "./helpers";

describe("vuelos y programación", () => {
  it("crea un vuelo con contratos compartidos y actualiza el listado", async () => {
    const user = userEvent.setup();
    const send = mockApi(session(["operator"]), (path, init) =>
      path.endsWith("/flights") && init?.method === "POST"
        ? json(
            { ...flight, ...JSON.parse(String(init.body)), id: "new-flight" },
            201,
          )
        : undefined,
    );
    renderApp("/vuelos");
    await screen.findByRole("table");
    await user.click(screen.getByRole("button", { name: "Nuevo vuelo" }));
    await user.type(screen.getByLabelText(/Número de vuelo/), "AQ205");
    await user.selectOptions(screen.getByLabelText("Origen"), "GUA");
    await user.selectOptions(screen.getByLabelText("Destino"), "MEX");
    await user.click(screen.getByRole("button", { name: "Guardar vuelo" }));
    await screen.findByText("Vuelo AQ205 creado.");
    expect(
      send.mock.calls.find(
        ([path, init]) =>
          String(path).endsWith("/flights") && init?.method === "POST",
      )?.[1]?.body,
    ).toBe(
      JSON.stringify({
        flightNumber: "AQ205",
        origin: "GUA",
        destination: "MEX",
        durationMinutes: 60,
        active: true,
      }),
    );
  });
  it("rechaza una ruta con origen y destino iguales antes de enviar", async () => {
    const user = userEvent.setup();
    const send = mockApi();
    renderApp("/vuelos");
    await screen.findByRole("table");
    await user.click(screen.getByRole("button", { name: "Nuevo vuelo" }));
    await user.type(screen.getByLabelText(/Número de vuelo/), "AQ205");
    await user.selectOptions(screen.getByLabelText("Origen"), "GUA");
    await user.selectOptions(screen.getByLabelText("Destino"), "GUA");
    await user.click(screen.getByRole("button", { name: "Guardar vuelo" }));
    await screen.findByText("El origen y el destino deben ser diferentes");
    expect(send.mock.calls.some(([, init]) => init?.method === "POST")).toBe(
      false,
    );
  });
  it("edita y desactiva rutas sin eliminar el historial", async () => {
    const user = userEvent.setup();
    const send = mockApi(session(), (path, init) =>
      init?.method === "PATCH" && path.endsWith("/flight-1")
        ? json({ ...flight, active: false })
        : undefined,
    );
    renderApp("/vuelos");
    await user.click(
      await screen.findByRole("button", { name: "Editar AQ101" }),
    );
    await user.click(screen.getByRole("checkbox", { name: "Ruta activa" }));
    await user.click(screen.getByRole("button", { name: "Guardar vuelo" }));
    await screen.findByText("Vuelo AQ101 actualizado.");
    expect(
      JSON.parse(
        String(
          send.mock.calls.find(([, init]) => init?.method === "PATCH")?.[1]
            ?.body,
        ),
      ).active,
    ).toBe(false);
    expect(send.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(
      false,
    );
  });
  it("programa horarios convirtiendo hora de Guatemala a UTC", async () => {
    const user = userEvent.setup();
    const send = mockApi(session(), (path, init) =>
      path.endsWith("/flight-instances") && init?.method === "POST"
        ? json({ ...instance, ...JSON.parse(String(init.body)) })
        : undefined,
    );
    renderApp("/horarios");
    await screen.findByRole("table");
    await user.click(screen.getByRole("button", { name: "Programar salida" }));
    await user.selectOptions(screen.getByLabelText("Vuelo"), "flight-1");
    await user.selectOptions(screen.getByLabelText("Aeronave"), "aircraft-1");
    fireEvent.change(screen.getByLabelText("Salida (Guatemala)"), {
      target: { value: "2026-11-05T07:00" },
    });
    fireEvent.change(screen.getByLabelText("Llegada (Guatemala)"), {
      target: { value: "2026-11-05T09:30" },
    });
    await user.click(screen.getByRole("button", { name: "Guardar horario" }));
    await screen.findByText("Horario creado.");
    expect(
      JSON.parse(
        String(
          send.mock.calls.find(([, init]) => init?.method === "POST")?.[1]
            ?.body,
        ),
      ),
    ).toMatchObject({ departureAt: "2026-11-05T13:00:00.000Z", capacity: 72 });
  });
  it("rechaza llegada anterior a salida", async () => {
    const user = userEvent.setup();
    const send = mockApi();
    renderApp("/horarios");
    await screen.findByRole("table");
    await user.click(screen.getByRole("button", { name: "Programar salida" }));
    await user.selectOptions(screen.getByLabelText("Vuelo"), "flight-1");
    await user.selectOptions(screen.getByLabelText("Aeronave"), "aircraft-1");
    fireEvent.change(screen.getByLabelText("Salida (Guatemala)"), {
      target: { value: "2026-11-05T09:30" },
    });
    fireEvent.change(screen.getByLabelText("Llegada (Guatemala)"), {
      target: { value: "2026-11-05T07:00" },
    });
    await user.click(screen.getByRole("button", { name: "Guardar horario" }));
    await screen.findByText("La llegada debe ser posterior a la salida");
    expect(send.mock.calls.some(([, init]) => init?.method === "POST")).toBe(
      false,
    );
  });
  it("sólo ofrece transiciones válidas y muestra el rechazo definitivo del backend", async () => {
    const user = userEvent.setup();
    mockApi(session(), (_path, init) =>
      init?.method === "PATCH"
        ? json({ code: "FORBIDDEN", message: "Operación no autorizada" }, 403)
        : undefined,
    );
    renderApp("/horarios");
    const select = await screen.findByLabelText("Nuevo estado de AQ101");
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["En abordaje", "Cancelado"]);
    await user.click(screen.getByRole("button", { name: "Aplicar" }));
    await screen.findByText("Operación no autorizada");
    expect(screen.getByText("Programado")).toBeInTheDocument();
  });
  it("muestra disponibilidad real del contrato y filtra por fecha de Guatemala", async () => {
    mockApi();
    renderApp("/disponibilidad");
    await screen.findByRole("table", { name: "Disponibilidad de vuelos" });
    expect(screen.getByText("71")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Fecha de salida (Guatemala)"), {
      target: { value: "2026-11-06" },
    });
    await screen.findByText("Sin vuelos para mostrar");
  });
});

describe("reservas y Check-In", () => {
  it("busca por pasajero, muestra documento y oculta Check-In a operadores", async () => {
    const user = userEvent.setup();
    const send = mockApi(session(["operator"]));
    renderApp("/reservas");
    await user.type(
      await screen.findByLabelText("Código, pasajero o documento"),
      "Ana López",
    );
    await user.click(screen.getByRole("button", { name: "Buscar reservas" }));
    await user.click(
      await screen.findByRole("button", { name: "Ver reserva AQ7F3K9" }),
    );
    expect(screen.getByText("P1234567")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Check-In" }),
    ).not.toBeInTheDocument();
    expect(
      send.mock.calls.some(([path]) =>
        String(path).includes("q=Ana+L%C3%B3pez"),
      ),
    ).toBe(true);
  });
  it("busca reserva, completa Check-In y muestra asiento sin duplicar el envío", async () => {
    const user = userEvent.setup();
    const send = mockApi(session(["checkin_agent"]), (path, init) =>
      path.endsWith("/check-in") && init?.method === "POST"
        ? json({
            reservationCode: reservation.code,
            status: "CHECKED_IN",
            seats: [{ passengerId: "passenger-1", seatNumber: "1A" }],
          })
        : undefined,
    );
    renderApp("/check-in");
    await user.type(
      await screen.findByLabelText("Código de reserva"),
      reservation.code.toLowerCase(),
    );
    await user.click(screen.getByRole("button", { name: "Consultar reserva" }));
    await screen.findByText("P1234567");
    await user.dblClick(
      screen.getByRole("button", {
        name: "Confirmar Check-In y asignar asientos",
      }),
    );
    await screen.findByText("1A");
    expect(
      screen.getByRole("heading", { name: "Check-In" }),
    ).toBeInTheDocument();
    expect(
      send.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("button", {
        name: "Confirmar Check-In y asignar asientos",
      }),
    ).not.toBeInTheDocument();
  });
  it.each(["CANCELLED", "CHECKED_IN"] as const)(
    "no ofrece Check-In para reserva %s",
    async (status) => {
      const user = userEvent.setup();
      mockApi(session(["checkin_agent"]), (path) =>
        path.endsWith("/" + reservation.code)
          ? json({ ...reservation, status })
          : undefined,
      );
      renderApp("/check-in");
      await user.type(
        await screen.findByLabelText("Código de reserva"),
        reservation.code,
      );
      await user.click(
        screen.getByRole("button", { name: "Consultar reserva" }),
      );
      await screen.findByText("P1234567");
      expect(
        screen.queryByRole("button", {
          name: "Confirmar Check-In y asignar asientos",
        }),
      ).not.toBeInTheDocument();
    },
  );
  it("muestra fallo de Check-In y permite reintento explícito", async () => {
    const user = userEvent.setup();
    let fail = true;
    mockApi(session(), (path) =>
      path.endsWith("/check-in")
        ? fail
          ? json({ code: "CONFLICT", message: "El vuelo ya salió" }, 409)
          : json({
              reservationCode: reservation.code,
              status: "CHECKED_IN",
              seats: [{ passengerId: "passenger-1", seatNumber: "1A" }],
            })
        : undefined,
    );
    renderApp("/check-in");
    await user.type(
      await screen.findByLabelText("Código de reserva"),
      reservation.code,
    );
    await user.click(screen.getByRole("button", { name: "Consultar reserva" }));
    await user.click(
      await screen.findByRole("button", {
        name: "Confirmar Check-In y asignar asientos",
      }),
    );
    await screen.findByText("El vuelo ya salió");
    fail = false;
    await user.click(
      screen.getByRole("button", {
        name: "Confirmar Check-In y asignar asientos",
      }),
    );
    await screen.findByText("1A");
  });
  it("muestra reserva inexistente sin ofrecer Check-In", async () => {
    const user = userEvent.setup();
    mockApi(session(), (path) =>
      path.endsWith("/" + reservation.code)
        ? json({ code: "NOT_FOUND", message: "Reserva no encontrada" }, 404)
        : undefined,
    );
    renderApp("/check-in");
    await user.type(
      await screen.findByLabelText("Código de reserva"),
      reservation.code,
    );
    await user.click(screen.getByRole("button", { name: "Consultar reserva" }));
    await screen.findByText("Reserva no encontrada");
    expect(screen.queryByText("Confirmar pasajeros")).not.toBeInTheDocument();
  });
});

describe("carga, errores, vacío y auditoría", () => {
  it("reintenta un error del panel sin inventar métricas", async () => {
    let fail = true;
    mockApi(session(), (path) =>
      path.endsWith("/dashboard") && fail ? json({}, 503) : undefined,
    );
    renderApp();
    await screen.findByRole("button", { name: "Reintentar" });
    expect(screen.queryByText("Vuelos programados")).not.toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await screen.findByText("Vuelos programados");
  });
  it("renderiza y filtra eventos de sólo lectura", async () => {
    const send = mockApi(session(["viewer"]));
    renderApp("/auditoria");
    await screen.findByText("CHECK_IN");
    fireEvent.change(screen.getByLabelText("Filtrar auditoría"), {
      target: { value: "unknown" },
    });
    await screen.findByText("Sin eventos para mostrar");
    expect(send.mock.calls.every(([, init]) => init?.method === "GET")).toBe(
      true,
    );
  });
  it("muestra listas vacías correctamente", async () => {
    mockApi(session(), (path) =>
      path.endsWith("/flights") ? json([]) : undefined,
    );
    renderApp("/vuelos");
    await waitFor(() =>
      expect(screen.getByText("Sin vuelos para mostrar")).toBeInTheDocument(),
    );
  });
});
