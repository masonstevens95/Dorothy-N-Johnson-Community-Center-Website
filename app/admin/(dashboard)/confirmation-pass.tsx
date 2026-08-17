"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { confirmEventsAction } from "@/app/admin/actions";

export interface ConfirmableEvent {
  id: string;
  title: string;
  when: string;
  confirmedLabel: string;
  stale: boolean;
}

function SubmitButton({ count }: { count: number }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || count === 0}
      className="w-full rounded-lg bg-accent px-4 py-3 text-base font-medium text-white disabled:opacity-40"
    >
      {pending
        ? "Confirming…"
        : count === 0
          ? "Select events to confirm"
          : `Confirm ${count} ${count === 1 ? "event" : "events"}`}
    </button>
  );
}

/**
 * The confirmation pass (R16).
 *
 * Tapping a row selects it; one button confirms everything selected. This is
 * deliberately not a link into the editor — the whole freshness design depends
 * on confirming being faster than editing, so opening a form to say "still
 * accurate" would defeat it.
 */
export function ConfirmationPass({ events }: { events: ConfirmableEvent[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = events.length > 0 && selected.size === events.length;

  if (events.length === 0) {
    return (
      <p className="mt-4 text-sm text-muted">
        Nothing is published yet. Add an event and it will show up here for
        confirming.
      </p>
    );
  }

  return (
    <form action={confirmEventsAction} className="mt-4">
      <button
        type="button"
        onClick={() =>
          setSelected(allSelected ? new Set() : new Set(events.map((e) => e.id)))
        }
        className="text-sm underline"
      >
        {allSelected ? "Clear selection" : "Select all"}
      </button>

      <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
        {events.map((event) => {
          const checked = selected.has(event.id);

          return (
            <li key={event.id}>
              {/* The whole row is the target — this is used one-handed. */}
              <label className="flex cursor-pointer items-start gap-3 p-4">
                <input
                  type="checkbox"
                  name="eventId"
                  value={event.id}
                  checked={checked}
                  onChange={() => toggle(event.id)}
                  className="mt-1 h-5 w-5 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block font-medium">{event.title}</span>
                  <span className="block text-sm text-muted">{event.when}</span>
                  <span
                    className={`block text-sm ${event.stale ? "text-warn" : "text-muted"}`}
                  >
                    Confirmed {event.confirmedLabel}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-0 mt-4 bg-surface py-3">
        <SubmitButton count={selected.size} />
      </div>
    </form>
  );
}
