import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18082/__test/reset");
});
async function search(page: Page) {
  await page.getByLabel("Origen", { exact: true }).selectOption("GUA");
  await page.getByLabel("Destino", { exact: true }).selectOption("SAL");
  await page.getByLabel("Fecha de salida").fill("2099-11-05");
  await page
    .getByRole("button", { name: "Buscar vuelos", exact: true })
    .click();
}
async function book(page: Page) {
  await search(page);
  await page.getByRole("button", { name: "Elegir vuelo" }).click();
  await page.getByLabel("Nombres", { exact: true }).fill("Ana");
  await page.getByLabel("Apellidos", { exact: true }).fill("López");
  await page
    .getByLabel("Número de documento", { exact: true })
    .fill("P1234567");
  await page.getByLabel("Correo de contacto").fill("ana@example.com");
  await page
    .getByRole("button", { name: "Confirmar reserva gratuita" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Reserva gratuita confirmada" }),
  ).toBeVisible();
  await expect(page.getByText("AQ00001", { exact: true })).toBeVisible();
}
async function lookup(page: Page, document = "P1234567") {
  await page.getByLabel("Código de reserva").fill("aq00001");
  await page.getByLabel("Documento de verificación").fill(document);
  await page
    .getByRole("button", { name: "Consultar reserva", exact: true })
    .click();
}

test("reserva, consulta después de recargar y cancela liberando cupos", async ({
  page,
}) => {
  const errors: string[] = [];
  const apiPaths: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/api/"))
      apiPaths.push(new URL(request.url()).pathname);
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Tu próxima",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await book(page);
  await page.reload();
  await lookup(page);
  await expect(page.getByLabel("Resumen de reserva")).toContainText(
    "Confirmada",
  );
  await page
    .getByRole("button", { name: "Cancelar reserva", exact: true })
    .click();
  await page.getByRole("button", { name: "Sí, cancelar reserva" }).click();
  await expect(page.getByLabel("Resumen de reserva")).toContainText(
    "Cancelada",
  );
  await search(page);
  await expect(page.getByText("2 cupos disponibles")).toBeVisible();
  await page.getByLabel("Número de vuelo", { exact: true }).fill("aq118");
  await page
    .getByRole("button", { name: "Consultar estado", exact: true })
    .click();
  await expect(page.getByText("AQ118 · Programado")).toBeVisible();
  expect(apiPaths.every((path) => path.startsWith("/api/v1/public/"))).toBe(
    true,
  );
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
  expect(errors).toEqual([]);
});

test("exige documento correcto y no ofrece cancelar una reserva con Check-In", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await book(page);
  await lookup(page, "WRONG123");
  await expect(page.getByRole("alert")).toContainText(
    "No se encontró el registro",
  );
  await request.post("http://127.0.0.1:18082/__test/check-in/AQ00001");
  await lookup(page);
  await expect(page.getByLabel("Resumen de reserva")).toContainText(
    "Check-In completado",
  );
  await expect(
    page.getByRole("button", { name: "Cancelar reserva", exact: true }),
  ).toHaveCount(0);
});

test("maneja resultados vacíos, error de servicio y reintento", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Origen", { exact: true }).selectOption("SAL");
  await page.getByLabel("Destino", { exact: true }).selectOption("GUA");
  await page
    .getByRole("button", { name: "Buscar vuelos", exact: true })
    .click();
  await expect(
    page.getByText("No hay vuelos para esta búsqueda"),
  ).toBeVisible();
  await page.route(
    "**/api/v1/public/flights?*",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: "{}",
      }),
    { times: 1 },
  );
  await search(page);
  await expect(page.getByRole("alert")).toContainText(
    "El servicio no pudo completar",
  );
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Elegir vuelo" }),
  ).toBeVisible();
});
