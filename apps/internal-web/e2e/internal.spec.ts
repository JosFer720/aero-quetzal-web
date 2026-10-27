import { test, expect, type Page } from "@playwright/test";
import { deferred } from "../test/deferred";

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Usuario", { exact: true }).fill(username);
  await page.getByLabel("Contraseña").fill("e2e-only-password");
  await page.getByRole("button", { name: "Entrar a operaciones" }).click();
  await expect(
    page.getByRole("button", { name: "Cerrar sesión" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "AeroQuetzal, panel operacional", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Panel operacional" }),
  ).toBeVisible();
}

test("sesión real, reserva, Check-In, asiento, auditoría y permisos", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/check-in");
  await expect(
    page.getByRole("heading", { name: "Iniciar sesión" }),
  ).toBeVisible();
  await login(page, "checkin");
  await page.getByRole("link", { name: "Pasajeros y reservas" }).click();
  await page.getByLabel("Código, pasajero o documento").fill("Ana");
  await page.getByRole("button", { name: "Buscar reservas" }).click();
  await page.getByRole("table").getByRole("link", { name: "Check-In" }).click();
  await expect(page.getByText("P1234567")).toBeVisible();
  const noCsrf = await page.request.post(
    "/api/v1/internal/reservations/AQ7F3K9/check-in",
    {
      headers: { Origin: "http://127.0.0.1:5174" },
      data: {},
    },
  );
  expect(noCsrf.status()).toBe(403);
  await page
    .getByRole("button", { name: "Confirmar Check-In y asignar asientos" })
    .click();
  await expect(
    page.getByRole("cell", { name: "1A", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByLabel("Código de reserva").fill("AQ7F3K9");
  await page.getByRole("button", { name: "Consultar reserva" }).click();
  await expect(
    page.getByText("Esta reserva ya tiene Check-In.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirmar Check-In y asignar asientos" }),
  ).toHaveCount(0);
  const cookies = await page.context().cookies();
  expect(cookies.find((cookie) => cookie.name === "aq_session")).toMatchObject({
    httpOnly: true,
    sameSite: "Strict",
    path: "/api/v1",
  });
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
  await page.goto("/vuelos");
  await expect(
    page.getByRole("heading", { name: "Acceso denegado" }),
  ).toBeVisible();
  // Además del bloqueo de UI, el guard de Hugo rechaza llamadas directas de este rol.
  const forbidden = await page.request.get("/api/v1/internal/flights");
  expect(forbidden.status()).toBe(403);
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(
    page.getByRole("heading", { name: "Iniciar sesión" }),
  ).toBeVisible();
  await login(page, "viewer");
  await page.getByRole("link", { name: "Auditoría" }).click();
  await expect(
    page.getByRole("cell", { name: "CHECK_IN", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "checkin", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("admin crea y edita un vuelo y programa una salida", async ({ page }) => {
  await login(page, "admin");
  await page.getByRole("link", { name: "Vuelos", exact: true }).click();
  await page.getByRole("button", { name: "Nuevo vuelo" }).click();
  await page.getByLabel("Número de vuelo", { exact: false }).fill("AQ205");
  await page.getByLabel("Origen", { exact: true }).selectOption("GUA");
  await page.getByLabel("Destino", { exact: true }).selectOption("MEX");
  await page.getByRole("button", { name: "Guardar vuelo" }).click();
  await expect(page.getByText("Vuelo AQ205 creado.")).toBeVisible();
  await page.getByRole("button", { name: "Editar AQ205" }).click();
  await page.getByLabel("Duración (minutos)").fill("150");
  await page.getByRole("button", { name: "Guardar vuelo" }).click();
  await expect(page.getByText("Vuelo AQ205 actualizado.")).toBeVisible();
  await page.getByRole("link", { name: "Horarios", exact: true }).click();
  await page.getByRole("button", { name: "Programar salida" }).click();
  await page
    .getByLabel("Vuelo", { exact: true })
    .selectOption({ label: "AQ205 · GUA → MEX" });
  await page.getByLabel("Aeronave", { exact: true }).selectOption("aircraft-1");
  await page
    .getByLabel("Salida (Guatemala)", { exact: true })
    .fill("2026-11-06T07:00");
  await page
    .getByLabel("Llegada (Guatemala)", { exact: true })
    .fill("2026-11-06T09:30");
  await page.getByRole("button", { name: "Guardar horario" }).click();
  await expect(page.getByText("Horario creado.")).toBeVisible();
  await expect(
    page.getByRole("table").getByText("AQ205", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Disponibilidad", exact: true }).click();
  await expect(
    page.getByRole("table").getByText("AQ205", { exact: true }),
  ).toBeVisible();
});

test("layout usable en móvil y login muestra credenciales inválidas", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByLabel("Usuario", { exact: true }).fill("admin");
  await page.getByLabel("Contraseña").fill("wrong");
  await page.getByRole("button", { name: "Entrar a operaciones" }).click();
  await expect(
    page.getByText("Usuario o contraseña incorrectos"),
  ).toBeVisible();
  await expect(page.getByLabel("Contraseña")).toHaveValue("");
  await page.getByLabel("Contraseña").fill("e2e-only-password");
  await page.getByRole("button", { name: "Entrar a operaciones" }).click();
  await page.getByRole("link", { name: "Vuelos", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Vuelos", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nuevo vuelo" }).click();
  await expect(
    page.getByLabel("Número de vuelo", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("logout descarta una sesión tardía y bloquea revalidaciones mientras se cierra", async ({
  page,
}) => {
  await login(page, "checkin");
  await page.getByRole("link", { name: "Check-In", exact: true }).click();
  const snapshotReady = deferred<void>();
  const snapshotGate = deferred<void>();
  const logoutReady = deferred<void>();
  const logoutGate = deferred<void>();
  let sessionReads = 0;
  await page.route("**/api/v1/auth/session", async (route) => {
    sessionReads++;
    const response = await route.fetch();
    snapshotReady.resolve();
    await snapshotGate.promise;
    await route.fulfill({ response });
  });
  await page.route("**/api/v1/auth/logout", async (route) => {
    logoutReady.resolve();
    await logoutGate.promise;
    await route.continue();
  });
  try {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await snapshotReady.promise;
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await logoutReady.promise;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    logoutGate.resolve();
    await expect(
      page.getByRole("heading", { name: "Iniciar sesión" }),
    ).toBeVisible();
    const finished = page.waitForEvent("requestfinished", (request) =>
      request.url().endsWith("/api/v1/auth/session"),
    );
    snapshotGate.resolve();
    await finished;
    // Deja que React procese la respuesta retenida y pinte el resultado.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(
      page.getByRole("heading", { name: "Iniciar sesión" }),
    ).toBeVisible();
    await expect(page.getByRole("navigation")).toHaveCount(0);
    expect(sessionReads).toBe(1);
  } finally {
    logoutGate.resolve();
    snapshotGate.resolve();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("actualizar conserva los formularios de vuelos y horarios sin guardar", async ({
  page,
}) => {
  await login(page, "admin");
  await page.getByRole("link", { name: "Vuelos", exact: true }).click();
  await page.getByRole("button", { name: "Nuevo vuelo" }).click();
  await page.getByLabel("Número de vuelo", { exact: true }).fill("AQ987");
  await page.getByLabel("Origen", { exact: true }).selectOption("GUA");
  await page.getByLabel("Destino", { exact: true }).selectOption("MEX");
  const flightReload = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/internal/flights") &&
      response.request().method() === "GET",
  );
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await flightReload;
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByLabel("Número de vuelo", { exact: true })).toHaveValue(
    "AQ987",
  );
  await expect(page.getByLabel("Destino", { exact: true })).toHaveValue("MEX");
  await page.getByRole("button", { name: "Cancelar edición" }).click();
  await page.getByRole("button", { name: "Editar AQ101" }).click();
  await page.getByLabel("Duración (minutos)").fill("200");
  const editReload = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/internal/flights") &&
      response.request().method() === "GET",
  );
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await editReload;
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByLabel("Duración (minutos)")).toHaveValue("200");
  await page.getByRole("link", { name: "Horarios", exact: true }).click();
  await page.getByRole("button", { name: "Programar salida" }).click();
  await page.getByLabel("Vuelo", { exact: true }).selectOption("flight-1");
  await page.getByLabel("Aeronave", { exact: true }).selectOption("aircraft-1");
  await page
    .getByLabel("Salida (Guatemala)", { exact: true })
    .fill("2026-11-06T07:00");
  await page
    .getByLabel("Llegada (Guatemala)", { exact: true })
    .fill("2026-11-06T09:30");
  await page.getByLabel("Capacidad", { exact: true }).fill("50");
  const scheduleReload = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/internal/flight-instances") &&
      response.request().method() === "GET",
  );
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await scheduleReload;
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByLabel("Capacidad", { exact: true })).toHaveValue("50");
  await expect(
    page.getByLabel("Salida (Guatemala)", { exact: true }),
  ).toHaveValue("2026-11-06T07:00");
});
