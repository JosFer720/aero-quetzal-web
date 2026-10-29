import { useEffect, useEffectEvent, useState } from "react";
import { errorMessage } from "./api";

type Result<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: T };

export function useResource<T>(
  key: string | null,
  load: (signal: AbortSignal) => Promise<T>,
) {
  const loadCurrent = useEffectEvent(load);
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    key: string;
    revision: number;
    result: Result<T>;
  } | null>(null);
  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    void loadCurrent(controller.signal).then(
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
    key === null
      ? { status: "idle" }
      : snapshot?.key === key && snapshot.revision === revision
        ? snapshot.result
        : { status: "loading" };
  return { result, reload: () => setRevision((value) => value + 1) };
}
