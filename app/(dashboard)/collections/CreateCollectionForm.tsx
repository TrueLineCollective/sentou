"use client";

import { useActionState, useRef, useEffect } from "react";
import { createCollectionAction } from "./actions";

const INITIAL: { error?: string } = {};

export function CreateCollectionForm() {
  const [state, formAction, pending] = useActionState(createCollectionAction, INITIAL);
  const inputRef = useRef<HTMLInputElement>(null);

  // Clear the input on successful creation (no error, not pending)
  useEffect(() => {
    if (!pending && !state.error && inputRef.current) {
      inputRef.current.value = "";
    }
  }, [pending, state.error]);

  return (
    <form action={formAction} className="flex items-center gap-3">
      <input
        ref={inputRef}
        name="title"
        type="text"
        required
        placeholder="Collection title"
        maxLength={120}
        className="flex-1 bg-transit-surface border border-transit-border rounded-lg px-3.5 py-2.5 text-sm text-transit-periwinkle placeholder:text-transit-muted/50 focus:outline-none focus:border-transit-periwinkle/60 transition-colors duration-150"
        aria-label="New collection title"
      />
      <button
        type="submit"
        disabled={pending}
        className="flex items-center gap-1.5 px-4 py-2.5 bg-transit-mint text-transit-canvas font-bold text-sm rounded-lg hover:bg-transit-mint/90 disabled:opacity-50 transition-colors duration-150"
      >
        <span aria-hidden="true">+</span>
        {pending ? "Creating..." : "New Collection"}
      </button>
      {state.error && (
        <p role="alert" className="text-xs text-red-400 font-mono">
          {state.error}
        </p>
      )}
    </form>
  );
}
