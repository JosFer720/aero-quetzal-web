import { useState, type SubmitEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Plane, ShieldCheck } from "lucide-react";
import { Button } from "@aeroquetzal/ui/button";
import { Input } from "@aeroquetzal/ui/input";
import { Field } from "@aeroquetzal/ui/field";
import { ErrorState, Loading } from "@aeroquetzal/ui/feedback";
import { useAuth } from "../auth";
import { errorMessage } from "../api";

export function LoginPage() {
  const { state, login, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const location = useLocation();
  const requested: unknown = location.state?.from;
  const returnTo =
    typeof requested === "string" &&
    requested.startsWith("/") &&
    !requested.startsWith("//") &&
    requested !== "/login"
      ? requested
      : "/";
  if (state.status === "authenticated")
    return <Navigate to={returnTo} replace />;

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      await login({
        username: String(data.get("username")),
        password: String(data.get("password")),
      });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      const password = form.elements.namedItem("password");
      if (password instanceof HTMLInputElement) password.value = "";
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-svh items-center p-5 sm:p-10">
      <div className="mx-auto grid w-full max-w-5xl border-4 bg-card shadow-xl md:grid-cols-2">
        <section className="flex flex-col justify-between gap-10 border-b-4 bg-primary p-7 md:border-r-4 md:border-b-0 sm:p-10">
          <div>
            <Plane aria-hidden="true" className="mb-6 size-12 -rotate-45" />
            <p className="font-head text-xl">AEROQUETZAL</p>
            <h1 className="mt-6 text-3xl leading-tight sm:text-4xl">
              Todo listo para
              <br />
              la próxima salida.
            </h1>
            <p className="mt-5 max-w-xs text-sm">
              Vuelos, pasajeros y Check-In en un mismo centro de operaciones.
            </p>
          </div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
            <ShieldCheck aria-hidden="true" className="size-5" />
            Portal de personal autorizado
          </p>
        </section>
        <section className="grid content-center gap-6 p-7 sm:p-10">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-widest">
              Intranet
            </p>
            <h2 className="font-head text-2xl">Iniciar sesión</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Usa tu cuenta del directorio interno desde una red autorizada o
              VPN.
            </p>
          </div>
          {state.status === "loading" ? (
            <Loading>Verificando sesión…</Loading>
          ) : state.status === "error" ? (
            <ErrorState
              message={state.message}
              onRetry={() => {
                void refresh();
              }}
            />
          ) : (
            <>
              {state.expired ? (
                <p role="status" className="border-2 bg-muted p-3 text-sm">
                  La sesión terminó. Inicia sesión para continuar.
                </p>
              ) : null}
              {error ? <ErrorState message={error} /> : null}
              <form
                onSubmit={(event) => {
                  void submit(event);
                }}
                className="grid gap-5"
                aria-label="Inicio de sesión"
              >
                <Field label="Usuario">
                  <Input
                    name="username"
                    autoComplete="username"
                    maxLength={80}
                    required
                    autoCapitalize="none"
                    spellCheck={false}
                    className="h-11"
                    disabled={busy}
                  />
                </Field>
                <Field label="Contraseña">
                  <Input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    maxLength={256}
                    required
                    className="h-11"
                    disabled={busy}
                  />
                </Field>
                <Button type="submit" size="lg" disabled={busy}>
                  {busy ? "Validando credenciales…" : "Entrar a operaciones"}
                </Button>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
