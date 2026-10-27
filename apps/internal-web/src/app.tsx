import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  Link,
} from "react-router-dom";
import { Button } from "@aeroquetzal/ui/button";
import { EmptyState, ErrorState, Loading } from "@aeroquetzal/ui/feedback";
import { AuthProvider, useAuth } from "./auth";
import { canAccess, type Permission } from "./permissions";
import { Layout } from "./components/layout";
import { LoginPage } from "./pages/login";
import { DashboardPage } from "./pages/dashboard";
import { FlightsPage } from "./pages/flights";
import { SchedulesPage, AvailabilityPage } from "./pages/schedules";
import { ReservationsPage } from "./pages/reservations";
import { CheckInPage } from "./pages/check-in";
import { AuditPage } from "./pages/audit";

function ProtectedRoute({ permission }: { permission?: Permission }) {
  const { state, refresh } = useAuth();
  const location = useLocation();
  if (state.status === "loading")
    return (
      <div className="mx-auto max-w-lg p-10">
        <Loading>Verificando sesión…</Loading>
      </div>
    );
  if (state.status === "error")
    return (
      <div className="mx-auto max-w-lg p-10">
        <ErrorState
          message={state.message}
          onRetry={() => {
            void refresh();
          }}
        />
      </div>
    );
  if (state.status === "anonymous")
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (permission && !canAccess(state.session.user.roles, permission))
    return (
      <EmptyState title="Acceso denegado">
        Tu cuenta no tiene permiso para abrir esta sección.{" "}
        <Link className="underline" to="/">
          Volver al panel
        </Link>
      </EmptyState>
    );
  return <Outlet />;
}

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route element={<ProtectedRoute permission="flights" />}>
              <Route path="vuelos" element={<FlightsPage />} />
            </Route>
            <Route element={<ProtectedRoute permission="schedules" />}>
              <Route path="horarios" element={<SchedulesPage />} />
            </Route>
            <Route element={<ProtectedRoute permission="availability" />}>
              <Route path="disponibilidad" element={<AvailabilityPage />} />
            </Route>
            <Route element={<ProtectedRoute permission="reservations" />}>
              <Route path="reservas" element={<ReservationsPage />} />
            </Route>
            <Route element={<ProtectedRoute permission="checkIn" />}>
              <Route path="check-in" element={<CheckInPage />} />
            </Route>
            <Route element={<ProtectedRoute permission="audit" />}>
              <Route path="auditoria" element={<AuditPage />} />
            </Route>
            <Route
              path="*"
              element={
                <EmptyState title="Página no encontrada">
                  <Button asChild variant="link">
                    <Link to="/">Volver al panel</Link>
                  </Button>
                </EmptyState>
              }
            />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
