import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = join(packageRoot, "prisma", "schema.prisma");
const migrationPath = join(
  packageRoot,
  "prisma",
  "migrations",
  "20261026231500_initial_schema",
  "migration.sql",
);

describe("esquema inicial", () => {
  it("incluye exactamente las entidades de negocio requeridas", async () => {
    const schema = await readFile(schemaPath, "utf8");
    const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map(
      (match) => match[1],
    );

    expect(models).toEqual([
      "Airport",
      "Aircraft",
      "Flight",
      "FlightInstance",
      "Passenger",
      "Reservation",
      "ReservationPassenger",
      "SeatAssignment",
      "CheckIn",
      "AuditEvent",
    ]);
    expect(schema).not.toMatch(/model\s+(Payment|Invoice|Transaction|Notification)\s*\{/);
  });

  it("versiona relaciones, índices y restricciones críticas", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain('CREATE TABLE "reservations"');
    expect(migration).toContain('CREATE TABLE "check_ins"');
    expect(migration).toContain("flight_instances_inventory_check");
    expect(migration).toContain("reservations_cancelled_at_check");
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "seat_assignments_flight_instance_id_seat_number_key"',
    );
    expect(migration).toContain("ON DELETE CASCADE");
    expect(migration).toContain("ON DELETE RESTRICT");
  });
});
