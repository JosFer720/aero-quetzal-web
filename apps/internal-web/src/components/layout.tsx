import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Plane,
  LayoutDashboard,
  CalendarDays,
  Users,
  ClipboardCheck,
  History,
  Armchair,
  Route,
  LogOut,
} from "lucide-react";
import { Button } from "@aeroquetzal/ui/button";
import { ErrorState } from "@aeroquetzal/ui/feedback";
import { Badge } from "@aeroquetzal/ui/badge";
import { useAuth } from "../auth";
import { errorMessage } from "../api";
import { canAccess, roleLabels, type Permission } from "../permissions";

const navigation = [
  {
    path: "/",
    label: "Panel operacional",
    permission: "dashboard",
    icon: LayoutDashboard,
  },
  { path: "/vuelos", label: "Vuelos", permission: "flights", icon: Route },
  {
    path: "/horarios",
    label: "Horarios",
    permission: "schedules",
    icon: CalendarDays,
  },
  {
    path: "/disponibilidad",
    label: "Disponibilidad",
    permission: "availability",
    icon: Armchair,
  },
  {
    path: "/reservas",
    label: "Pasajeros y reservas",
    permission: "reservations",
    icon: Users,
  },
  {
    path: "/check-in",
    label: "Check-In",
    permission: "checkIn",
    icon: ClipboardCheck,
  },
  {
    path: "/auditoria",
    label: "Auditoría",
    permission: "audit",
    icon: History,
  },
] as const satisfies readonly {
  path: string;
  label: string;
  permission: Permission;
  icon: typeof Plane;
}[];

export function Layout() {
  const { state, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { pathname } = useLocation();
  useEffect(() => {
    document.title =
      (navigation.find((item) => item.path === pathname)?.label ??
        "Operaciones") + " · AeroQuetzal";
    document.getElementById("main-content")?.focus();
  }, [pathname]);
  if (state.status !== "authenticated") return null;
  const { user } = state.session;
  async function handleLogout() {
    setBusy(true);
    setError("");
    try {
      await logout();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-h-svh">
      <a
        href="#main-content"
        className="sr-only z-50 bg-primary p-3 focus:not-sr-only focus:fixed"
      >
        Saltar al contenido
      </a>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b-4 bg-primary px-5 py-4 sm:px-8">
        <NavLink
          to="/"
          className="flex items-center gap-3"
          aria-label="AeroQuetzal, panel operacional"
        >
          <span className="grid size-11 place-items-center border-2 bg-card shadow-md">
            <Plane className="size-6 -rotate-45" />
          </span>
          <span>
            <span className="block font-head text-xl tracking-tight">
              AEROQUETZAL
            </span>
            <span className="text-xs font-bold uppercase tracking-widest">
              Centro de operaciones
            </span>
          </span>
        </NavLink>
        <Badge variant="outline" className="h-auto bg-card px-3 py-2">
          Intranet · Acceso interno
        </Badge>
      </header>
      <div className="mx-auto grid max-w-[1600px] lg:min-h-[calc(100svh-92px)] lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="flex flex-col border-b-4 bg-card lg:border-r-4 lg:border-b-0">
          <div className="border-b-2 p-5">
            <p className="font-bold break-words">{user.displayName}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              @{user.username}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {user.roles.map((role) => (
                <Badge
                  key={role}
                  variant="outline"
                  className="h-auto whitespace-normal bg-muted py-1 text-[10px]"
                >
                  {roleLabels[role]}
                </Badge>
              ))}
            </div>
          </div>
          <nav
            aria-label="Navegación de operaciones"
            className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-1"
          >
            {navigation
              .filter((item) => canAccess(user.roles, item.permission))
              .map(({ path, label, icon: Icon }) => (
                <NavLink
                  key={path}
                  to={path}
                  end={path === "/"}
                  className={({ isActive }) =>
                    "flex items-center gap-3 border-2 px-3 py-3 text-sm font-bold " +
                    (isActive
                      ? "bg-primary shadow-sm"
                      : "border-transparent hover:border-black hover:bg-muted")
                  }
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  {label}
                </NavLink>
              ))}
          </nav>
          <div className="mt-auto border-t-2 p-4">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                void handleLogout();
              }}
              disabled={busy}
            >
              <LogOut aria-hidden="true" />
              {busy ? "Cerrando sesión…" : "Cerrar sesión"}
            </Button>
            <p className="mt-4 text-xs text-muted-foreground">
              AeroQuetzal · Operación simulada
              <br />
              Hora de Guatemala (UTC−06:00)
            </p>
          </div>
        </aside>
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 p-5 outline-none sm:p-8 lg:p-10"
        >
          {error ? (
            <div className="mb-6">
              <ErrorState message={error} />
            </div>
          ) : null}
          <Outlet key={user.username + ":" + user.roles.join(",")} />
        </main>
      </div>
    </div>
  );
}
