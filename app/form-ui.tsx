"use client";

import { useFormStatus } from "react-dom";

/**
 * The few form primitives every surface on this site shares.
 *
 * Phone-first: full-width targets and 16px text, which is the size below which
 * iOS zooms the whole page on focus.
 */

export const fieldClass =
  "mt-1 w-full rounded-lg border border-line bg-white px-3 py-3 text-base";

export interface SubmitButtonProps {
  label: string;
  /** Shown while the action is in flight; defaults to the label plus an ellipsis. */
  pendingLabel?: string;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}

/**
 * Reads pending state from the enclosing form, so it must be rendered inside
 * one rather than receiving a prop.
 */
export function SubmitButton({
  label,
  pendingLabel,
  disabled = false,
  variant = "primary",
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  const base =
    "w-full rounded-lg px-4 py-3 text-base font-medium disabled:opacity-60";
  const styles =
    variant === "primary"
      ? "bg-accent text-white"
      : "border border-line disabled:opacity-60";

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={`${base} ${styles}`}
    >
      {pending ? (pendingLabel ?? `${label}…`) : label}
    </button>
  );
}

/** Consistent placement and role for action-level error messages. */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <p role="alert" className="rounded-lg border border-line p-3 text-sm text-warn">
      {message}
    </p>
  );
}

/** A validation message attached to a single field. */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;

  return <p className="mt-1 text-sm text-warn">{message}</p>;
}
