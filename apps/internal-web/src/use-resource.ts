import { useEffect, useRef, useState } from "react";
import { errorMessage } from "./api";

type Result<T> =
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; message: string };

// Cancela lecturas al cambiar el filtro o salir de la pantalla; no conserva datos personales entre sesiones.
export function useResource<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
) {
  const loader = useRef(load);
  loader.current = load;
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    key: string;
    revision: number;
    result: Result<T>;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void loader.current(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted)
          setSnapshot({ key, revision, result: { status: "success", data } });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setSnapshot({
            key,
            revision,
            result: { status: "error", message: errorMessage(error) },
          });
      },
    );
    return () => controller.abort();
  }, [key, revision]);
  const result: Result<T> =
    snapshot?.key === key && snapshot.revision === revision
      ? snapshot.result
      : { status: "loading" };
  return { result, reload: () => setRevision((value) => value + 1) };
}
