"use client";
import { useEffect, useRef } from "react";

/** Small accessible confirmation modal used before irreversible actions (withdraw, leave). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  danger = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div className="w-full max-w-sm rounded-xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-title" className="font-serif text-lg font-bold text-penn-blue">
          {title}
        </h2>
        <p className="mt-2 text-sm text-ink">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-md px-4 py-2 text-sm font-medium text-ink hover:bg-surface-alt">
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`rounded-md px-4 py-2 text-sm font-semibold text-white ${danger ? "bg-penn-red hover:bg-penn-red-hover" : "bg-penn-blue hover:bg-penn-blue-hover"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
