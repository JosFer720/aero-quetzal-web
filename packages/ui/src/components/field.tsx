import {
  cloneElement,
  useId,
  type ComponentProps,
  type ReactElement,
} from "react";
import { cn } from "../utils";

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactElement<{ id?: string; "aria-describedby"?: string }>;
  hint?: string;
}) {
  const generatedId = useId();
  const id = children.props.id ?? generatedId;
  const hintId = id + "-hint";
  const describedBy = [children.props["aria-describedby"], hint ? hintId : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="grid gap-2 text-sm font-medium">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, {
        id,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
      })}
      {hint ? (
        <span id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "min-h-10 w-full min-w-0 border-2 bg-input px-3 py-2 text-sm shadow-sm disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
