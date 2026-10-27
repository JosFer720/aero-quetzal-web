import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "./alert";
import { Button } from "./button";

export function Loading({ children = "Cargando…" }: { children?: ReactNode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="border-2 bg-card p-6 shadow-md"
    >
      <span
        className="mr-3 inline-block size-3 bg-primary"
        aria-hidden="true"
      />
      {children}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Alert status="error">
      <AlertTitle>No se pudo completar la operación</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        {onRetry ? (
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            Reintentar
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-2 border-dashed bg-card p-8 text-center">
      <h2 className="text-lg">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{children}</p>
    </section>
  );
}

export function PageHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-7 border-b-4 pb-5">
      <p className="mb-2 text-xs font-bold uppercase tracking-widest">
        {eyebrow}
      </p>
      <h1 className="text-2xl leading-tight sm:text-3xl">{title}</h1>
      {children ? (
        <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
          {children}
        </p>
      ) : null}
    </header>
  );
}
