import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  LoginRequest,
  SessionResponse,
  SessionUser,
} from "@aeroquetzal/api-contracts";
import { ApiError, createApi, errorMessage, type InternalApi } from "./api";

type Session = { user: SessionUser; csrfToken: string; expiresAt: string };
type AuthState =
  | { status: "loading" }
  | { status: "anonymous"; expired: boolean }
  | { status: "error"; message: string }
  | { status: "authenticated"; session: Session };
type AuthContextValue = {
  state: AuthState;
  api: InternalApi;
  refresh: () => Promise<void>;
  login: (body: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const csrf = useRef<string | null>(null);
  const epoch = useRef(0);
  const [api] = useState(() =>
    createApi({
      csrfToken: () => csrf.current,
      onUnauthorized: () => {
        epoch.current++;
        csrf.current = null;
        setState({ status: "anonymous", expired: true });
      },
    }),
  );

  const accept = useCallback((response: SessionResponse) => {
    if (!response.authenticated) {
      csrf.current = null;
      setState((previous) => ({
        status: "anonymous",
        expired:
          previous.status === "authenticated" ||
          (previous.status === "anonymous" && previous.expired),
      }));
      return;
    }
    if (
      !response.user ||
      !response.csrfToken ||
      !response.expiresAt ||
      Date.parse(response.expiresAt) <= Date.now()
    ) {
      throw new ApiError(
        502,
        "INVALID_SESSION",
        "La respuesta de sesión no es válida.",
      );
    }
    csrf.current = response.csrfToken;
    setState({
      status: "authenticated",
      session: {
        user: response.user,
        csrfToken: response.csrfToken,
        expiresAt: response.expiresAt,
      },
    });
  }, []);

  const refresh = useCallback(async () => {
    const current = ++epoch.current;
    try {
      const response = await api.session();
      if (current === epoch.current) accept(response);
    } catch (error) {
      if (current === epoch.current) {
        csrf.current = null;
        setState({ status: "error", message: errorMessage(error) });
      }
    }
  }, [api, accept]);

  useEffect(() => {
    void refresh();
    return () => {
      epoch.current++;
    };
  }, [refresh]);

  useEffect(() => {
    if (state.status !== "authenticated") return;
    const timeout = window.setTimeout(
      () => {
        void refresh();
      },
      Math.max(0, Date.parse(state.session.expiresAt) - Date.now()) + 50,
    );
    const onFocus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("focus", onFocus);
    };
  }, [state, refresh]);

  async function login(body: LoginRequest) {
    const current = ++epoch.current;
    const response = await api.login(body);
    if (!response.authenticated)
      throw new ApiError(
        401,
        "INVALID_CREDENTIALS",
        "No se pudo iniciar sesión.",
      );
    if (current === epoch.current) accept(response);
  }
  async function logout() {
    ++epoch.current;
    await api.logout();
    csrf.current = null;
    setState({ status: "anonymous", expired: false });
  }

  return (
    <AuthContext.Provider value={{ state, api, refresh, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider es obligatorio");
  return context;
}
