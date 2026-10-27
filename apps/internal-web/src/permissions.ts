import type { AppRole } from "@aeroquetzal/domain";

export const permissions = {
  dashboard: ["admin", "operator", "checkin_agent", "viewer"],
  flights: ["admin", "operator"],
  schedules: ["admin", "operator"],
  availability: ["admin", "operator"],
  reservations: ["admin", "operator", "checkin_agent"],
  checkIn: ["admin", "checkin_agent"],
  audit: ["admin", "viewer"],
} as const satisfies Record<string, readonly AppRole[]>;

export type Permission = keyof typeof permissions;
export function canAccess(
  roles: readonly AppRole[],
  permission: Permission,
): boolean {
  return roles.some((role) =>
    (permissions[permission] as readonly AppRole[]).includes(role),
  );
}

export const roleLabels: Record<AppRole, string> = {
  admin: "Administración",
  operator: "Operaciones",
  checkin_agent: "Agente de Check-In",
  viewer: "Monitoreo",
};
