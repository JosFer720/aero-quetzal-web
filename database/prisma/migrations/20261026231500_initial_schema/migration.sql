CREATE TYPE "ReservationStatus" AS ENUM ('CONFIRMED', 'CHECKED_IN', 'CANCELLED');
CREATE TYPE "FlightStatus" AS ENUM ('SCHEDULED', 'BOARDING', 'DEPARTED', 'ARRIVED', 'CANCELLED');

CREATE TABLE "airports" (
    "id" TEXT NOT NULL,
    "code" CHAR(3) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "city" VARCHAR(80) NOT NULL,
    "country" VARCHAR(80) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "airports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "airports_code_format_check" CHECK ("code" ~ '^[A-Z]{3}$')
);

CREATE TABLE "aircraft" (
    "id" TEXT NOT NULL,
    "registration" VARCHAR(16) NOT NULL,
    "model" VARCHAR(80) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "aircraft_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "aircraft_capacity_check" CHECK ("capacity" > 0)
);

CREATE TABLE "flights" (
    "id" TEXT NOT NULL,
    "flight_number" VARCHAR(8) NOT NULL,
    "origin_id" TEXT NOT NULL,
    "destination_id" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "flights_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "flights_route_check" CHECK ("origin_id" <> "destination_id"),
    CONSTRAINT "flights_duration_check" CHECK ("duration_minutes" > 0),
    CONSTRAINT "flights_number_format_check" CHECK ("flight_number" ~ '^AQ[0-9]{3,4}$')
);

CREATE TABLE "flight_instances" (
    "id" TEXT NOT NULL,
    "flight_id" TEXT NOT NULL,
    "aircraft_id" TEXT NOT NULL,
    "departure_at" TIMESTAMPTZ(3) NOT NULL,
    "arrival_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "FlightStatus" NOT NULL DEFAULT 'SCHEDULED',
    "capacity" INTEGER NOT NULL,
    "reserved_seats" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "flight_instances_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "flight_instances_schedule_check" CHECK ("arrival_at" > "departure_at"),
    CONSTRAINT "flight_instances_capacity_check" CHECK ("capacity" > 0),
    CONSTRAINT "flight_instances_inventory_check" CHECK (
        "reserved_seats" >= 0 AND "reserved_seats" <= "capacity"
    )
);

CREATE TABLE "passengers" (
    "id" TEXT NOT NULL,
    "first_name" VARCHAR(80) NOT NULL,
    "last_name" VARCHAR(80) NOT NULL,
    "document_number" VARCHAR(24) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "passengers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "passengers_document_format_check" CHECK (
        "document_number" ~ '^[A-Z0-9-]{5,24}$'
    )
);

CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "code" CHAR(7) NOT NULL,
    "flight_instance_id" TEXT NOT NULL,
    "contact_email" VARCHAR(254) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "passenger_count" INTEGER NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reservations_code_format_check" CHECK ("code" ~ '^AQ[A-Z0-9]{5}$'),
    CONSTRAINT "reservations_passenger_count_check" CHECK ("passenger_count" > 0),
    CONSTRAINT "reservations_cancelled_at_check" CHECK (
        ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL)
        OR ("status" <> 'CANCELLED' AND "cancelled_at" IS NULL)
    )
);

CREATE TABLE "reservation_passengers" (
    "id" TEXT NOT NULL,
    "reservation_id" TEXT NOT NULL,
    "passenger_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reservation_passengers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "seat_assignments" (
    "id" TEXT NOT NULL,
    "reservation_passenger_id" TEXT NOT NULL,
    "flight_instance_id" TEXT NOT NULL,
    "seat_number" VARCHAR(4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "seat_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "seat_assignments_number_format_check" CHECK (
        "seat_number" ~ '^[1-9][0-9]{0,2}[A-F]$'
    )
);

CREATE TABLE "check_ins" (
    "id" TEXT NOT NULL,
    "reservation_passenger_id" TEXT NOT NULL,
    "performed_by" VARCHAR(80) NOT NULL,
    "checked_in_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "actor" VARCHAR(80) NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(80) NOT NULL,
    "entity_id" VARCHAR(64) NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "airports_code_key" ON "airports"("code");
CREATE INDEX "airports_active_code_idx" ON "airports"("active", "code");
CREATE UNIQUE INDEX "aircraft_registration_key" ON "aircraft"("registration");
CREATE INDEX "aircraft_active_idx" ON "aircraft"("active");
CREATE UNIQUE INDEX "flights_flight_number_key" ON "flights"("flight_number");
CREATE INDEX "flights_origin_id_destination_id_active_idx" ON "flights"("origin_id", "destination_id", "active");
CREATE INDEX "flight_instances_departure_at_status_idx" ON "flight_instances"("departure_at", "status");
CREATE INDEX "flight_instances_aircraft_id_departure_at_idx" ON "flight_instances"("aircraft_id", "departure_at");
CREATE UNIQUE INDEX "flight_instances_flight_id_departure_at_key" ON "flight_instances"("flight_id", "departure_at");
CREATE UNIQUE INDEX "passengers_document_number_key" ON "passengers"("document_number");
CREATE INDEX "passengers_last_name_first_name_idx" ON "passengers"("last_name", "first_name");
CREATE UNIQUE INDEX "reservations_code_key" ON "reservations"("code");
CREATE INDEX "reservations_flight_instance_id_status_idx" ON "reservations"("flight_instance_id", "status");
CREATE INDEX "reservations_contact_email_idx" ON "reservations"("contact_email");
CREATE INDEX "reservation_passengers_passenger_id_idx" ON "reservation_passengers"("passenger_id");
CREATE UNIQUE INDEX "reservation_passengers_reservation_id_passenger_id_key" ON "reservation_passengers"("reservation_id", "passenger_id");
CREATE UNIQUE INDEX "seat_assignments_reservation_passenger_id_key" ON "seat_assignments"("reservation_passenger_id");
CREATE UNIQUE INDEX "seat_assignments_flight_instance_id_seat_number_key" ON "seat_assignments"("flight_instance_id", "seat_number");
CREATE UNIQUE INDEX "check_ins_reservation_passenger_id_key" ON "check_ins"("reservation_passenger_id");
CREATE INDEX "check_ins_performed_by_checked_in_at_idx" ON "check_ins"("performed_by", "checked_in_at");
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");
CREATE INDEX "audit_events_actor_created_at_idx" ON "audit_events"("actor", "created_at");
CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at");

ALTER TABLE "flights" ADD CONSTRAINT "flights_origin_id_fkey"
    FOREIGN KEY ("origin_id") REFERENCES "airports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flights" ADD CONSTRAINT "flights_destination_id_fkey"
    FOREIGN KEY ("destination_id") REFERENCES "airports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flight_instances" ADD CONSTRAINT "flight_instances_flight_id_fkey"
    FOREIGN KEY ("flight_id") REFERENCES "flights"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "flight_instances" ADD CONSTRAINT "flight_instances_aircraft_id_fkey"
    FOREIGN KEY ("aircraft_id") REFERENCES "aircraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_flight_instance_id_fkey"
    FOREIGN KEY ("flight_instance_id") REFERENCES "flight_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reservation_passengers" ADD CONSTRAINT "reservation_passengers_reservation_id_fkey"
    FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reservation_passengers" ADD CONSTRAINT "reservation_passengers_passenger_id_fkey"
    FOREIGN KEY ("passenger_id") REFERENCES "passengers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_reservation_passenger_id_fkey"
    FOREIGN KEY ("reservation_passenger_id") REFERENCES "reservation_passengers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_flight_instance_id_fkey"
    FOREIGN KEY ("flight_instance_id") REFERENCES "flight_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_reservation_passenger_id_fkey"
    FOREIGN KEY ("reservation_passenger_id") REFERENCES "reservation_passengers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
