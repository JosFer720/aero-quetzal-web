import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/app";
import { Booking } from "../src/components/booking";
import { FlightSearch } from "../src/components/flight-search";
import { ReservationLookup } from "../src/components/reservation-lookup";
import { FlightStatus } from "../src/components/flight-status";
import { createPublicApi } from "../src/api";
import {
  airports,
  bookingRequest,
  confirmation,
  deferred,
  flight,
  json,
  reservation,
} from "./fixtures";

function mockApi(
  override?: (
    path: string,
    init?: RequestInit,
  ) => Response | Promise<Response> | undefined,
) {
  const send = vi.fn<typeof fetch>(async (path, init) => {
    const custom = override?.(String(path), init);
    if (custom) return custom;
    if (String(path).endsWith("/airports")) return json(airports);
    if (String(path).includes("/availability"))
      return json({
        flightInstanceId: flight.id,
        capacity: 2,
        availableSeats: 2,
      });
    if (String(path).includes("/flights?")) return json([flight]);
    if (String(path).includes("/reservations/") && init?.method === "GET")
      return json(reservation);
    return json(confirmation);
  });
  return { api: createPublicApi(send), send };
}
async function fillBooking() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Nombres"), "Ana");
  await user.type(screen.getByLabelText("Apellidos"), "López");
  await user.type(screen.getByLabelText("Número de documento"), "p1234567");
  await user.type(
    screen.getByLabelText("Correo de contacto"),
    "ana@example.com",
  );
  return user;
}
async function lookup() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Código de reserva"), "aq7f3k9");
  await user.type(
    screen.getByLabelText("Documento de verificación"),
    "p1234567",
  );
  await user.click(screen.getByRole("button", { name: "Consultar reserva" }));
  return user;
}

describe("web pública", () => {
  it("muestra carga, error y reintento del catálogo conservando la marca", async () => {
    let count = 0;
    const first = deferred<Response>();
    const { api } = mockApi(() => (++count === 1 ? first.promise : undefined));
    render(<App api={api} />);
    expect(screen.getByText("Cargando aeropuertos…")).toBeInTheDocument();
    await act(async () => first.resolve(json({}, 503)));
    await userEvent.click(
      await screen.findByRole("button", { name: "Reintentar" }),
    );
    expect(await screen.findByLabelText("Origen")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "AeroQuetzal, inicio" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Laboratorio 5|LDAP|Área privada/),
    ).not.toBeInTheDocument();
  });
  it("muestra un catálogo vacío sin inventar destinos", async () => {
    render(<App api={mockApi(() => json([])).api} />);
    expect(
      await screen.findByText("Aún no hay rutas disponibles"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Origen")).not.toBeInTheDocument();
  });
  it("valida origen distinto y muestra búsqueda vacía", async () => {
    const { api, send } = mockApi(() => json([]));
    const user = userEvent.setup();
    render(<FlightSearch api={api} airports={airports} />);
    await user.selectOptions(screen.getByLabelText("Origen"), "GUA");
    await user.selectOptions(screen.getByLabelText("Destino"), "GUA");
    await user.click(screen.getByRole("button", { name: "Buscar vuelos" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "aeropuertos diferentes",
    );
    expect(send).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByLabelText("Destino"), "SAL");
    await user.click(screen.getByRole("button", { name: "Buscar vuelos" }));
    expect(
      await screen.findByText("No hay vuelos para esta búsqueda"),
    ).toBeInTheDocument();
  });
  it.each([
    { availableSeats: 0 },
    { status: "BOARDING" },
    { departureAt: "2000-01-01T10:00:00Z" },
  ])("deshabilita vuelos no reservables: %j", async (changes) => {
    const user = userEvent.setup();
    render(
      <FlightSearch
        api={mockApi(() => json([{ ...flight, ...changes }])).api}
        airports={airports}
      />,
    );
    await user.selectOptions(screen.getByLabelText("Origen"), "GUA");
    await user.selectOptions(screen.getByLabelText("Destino"), "SAL");
    await user.click(screen.getByRole("button", { name: "Buscar vuelos" }));
    expect(
      await screen.findByRole("button", {
        name: /Sin cupos|Reserva no disponible/,
      }),
    ).toBeDisabled();
  });
  it("confirma con código sin persistir los datos del pasajero", async () => {
    const { api, send } = mockApi();
    const confirmed = vi.fn();
    render(
      <Booking
        api={api}
        flight={flight}
        onClose={vi.fn()}
        onConfirmed={confirmed}
      />,
    );
    const user = await fillBooking();
    await user.click(
      screen.getByRole("button", { name: "Confirmar reserva gratuita" }),
    );
    await waitFor(() => expect(confirmed).toHaveBeenCalledWith(confirmation));
    const body = send.mock.calls.find(
      ([path]) => path === "/api/v1/public/reservations",
    )?.[1]?.body;
    expect(JSON.parse(String(body))).toEqual(bookingRequest);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
  it("bloquea doble envío mientras el servidor confirma", async () => {
    const response = deferred<Response>();
    const confirmed = vi.fn();
    const { api, send } = mockApi((_path, init) =>
      init?.method === "POST" ? response.promise : undefined,
    );
    render(
      <Booking
        api={api}
        flight={flight}
        onClose={vi.fn()}
        onConfirmed={confirmed}
      />,
    );
    await fillBooking();
    const form = screen
      .getByRole("button", { name: "Confirmar reserva gratuita" })
      .closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(
      send.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Cambiar vuelo" }),
    ).toBeDisabled();
    await act(async () => response.resolve(json(confirmation)));
    await waitFor(() => expect(confirmed).toHaveBeenCalledTimes(1));
  });
  it("conserva el formulario y actualiza cupos ante una reserva concurrente", async () => {
    let booked = false;
    const { api } = mockApi((path, init) => {
      if (init?.method === "POST") {
        booked = true;
        return json({}, 409);
      }
      if (path.includes("availability") && booked)
        return json({
          flightInstanceId: flight.id,
          capacity: 2,
          availableSeats: 0,
        });
    });
    render(
      <Booking
        api={api}
        flight={flight}
        onClose={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    );
    const user = await fillBooking();
    await user.click(
      screen.getByRole("button", { name: "Confirmar reserva gratuita" }),
    );
    expect(
      await screen.findByText(/La disponibilidad o el estado cambió/),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        "No hay suficientes cupos para esta cantidad de pasajeros.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Nombres")).toHaveValue("Ana");
    expect(
      screen.getByRole("button", { name: "Confirmar reserva gratuita" }),
    ).toBeDisabled();
  });
  it("no permite más pasajeros que cupos disponibles", async () => {
    render(
      <Booking
        api={mockApi().api}
        flight={flight}
        onClose={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Cantidad de pasajeros"),
      "3",
    );
    expect(
      await screen.findByText(
        "No hay suficientes cupos para esta cantidad de pasajeros.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText("Nombres")).toHaveLength(3);
    expect(
      screen.getByRole("button", { name: "Confirmar reserva gratuita" }),
    ).toBeDisabled();
  });
  it("rechaza documentos duplicados en una misma reserva", async () => {
    const { api, send } = mockApi();
    render(
      <Booking
        api={api}
        flight={flight}
        onClose={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    );
    const user = await fillBooking();
    await user.selectOptions(
      screen.getByLabelText("Cantidad de pasajeros"),
      "2",
    );
    await user.type(screen.getAllByLabelText("Nombres")[1]!, "Luis");
    await user.type(screen.getAllByLabelText("Apellidos")[1]!, "Pérez");
    await user.type(
      screen.getAllByLabelText("Número de documento")[1]!,
      "P1234567",
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar reserva gratuita" }),
    );
    expect(
      await screen.findByText(
        "Cada pasajero debe tener un documento diferente.",
      ),
    ).toBeInTheDocument();
    expect(
      send.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(0);
  });
  it("consulta y cancela sólo después de confirmar la intención", async () => {
    let cancelled = false;
    const { api, send } = mockApi((path, init) => {
      if (path.endsWith("/cancel")) {
        cancelled = true;
        return json({
          code: reservation.code,
          status: "CANCELLED",
          restoredSeats: 1,
        });
      }
      if (init?.method === "GET")
        return json({
          ...reservation,
          status: cancelled ? "CANCELLED" : "CONFIRMED",
        });
    });
    render(<ReservationLookup api={api} />);
    const user = await lookup();
    await user.click(
      await screen.findByRole("button", {
        name: "Cancelar reserva",
      }),
    );
    expect(
      send.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Conservar reserva" }));
    await user.click(
      screen.getByRole("button", { name: "Cancelar reserva" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Sí, cancelar reserva" }),
    );
    expect(
      await screen.findByText("Cancelada", { exact: true }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancelar reserva" }),
    ).not.toBeInTheDocument();
  });
  it("no ofrece cancelación después del Check-In", async () => {
    render(
      <ReservationLookup
        api={mockApi(() => json({ ...reservation, status: "CHECKED_IN" })).api}
      />,
    );
    await lookup();
    expect(
      await screen.findByText(/ya completó el Check-In/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancelar reserva" }),
    ).not.toBeInTheDocument();
  });
  it("descarta una consulta que responde después de editar el documento", async () => {
    const response = deferred<Response>();
    render(<ReservationLookup api={mockApi(() => response.promise).api} />);
    const user = await lookup();
    await user.type(screen.getByLabelText("Documento de verificación"), "X");
    await act(async () => response.resolve(json(reservation)));
    expect(
      screen.queryByLabelText("Resumen de reserva"),
    ).not.toBeInTheDocument();
  });
  it("consulta el estado público y valida el número de vuelo", async () => {
    const { api, send } = mockApi(() =>
      json({
        flightNumber: flight.flightNumber,
        status: "BOARDING",
        departureAt: flight.departureAt,
        updatedAt: flight.departureAt,
      }),
    );
    const user = userEvent.setup();
    render(<FlightStatus api={api} />);
    await user.type(screen.getByLabelText("Número de vuelo"), "bad");
    await user.click(screen.getByRole("button", { name: "Consultar estado" }));
    expect(send).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText("Número de vuelo"));
    await user.type(screen.getByLabelText("Número de vuelo"), "aq118");
    await user.click(screen.getByRole("button", { name: "Consultar estado" }));
    expect(await screen.findByText("AQ118 · En abordaje")).toBeInTheDocument();
  });
});
