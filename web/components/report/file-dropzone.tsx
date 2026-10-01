"use client";

import { type DragEvent, useId, useState } from "react";

const ACCEPT = ".csv,.tsv,.txt,.xlsx";

type FileDropzoneProps = {
  onFiles: (files: File[]) => void;
  /** Smaller once a file is loaded, to leave room for the report. */
  compact?: boolean;
};

export function FileDropzone({ onFiles, compact = false }: FileDropzoneProps) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length > 0) onFiles([...event.dataTransfer.files]);
  }

  return (
    <label
      htmlFor={inputId}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        // Moving over the zone's own children also fires dragleave.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={handleDrop}
      className={[
        "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-center transition-colors",
        "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
        compact ? "px-4 py-5" : "px-6 py-14",
        dragging ? "border-accent bg-accent/5" : "border-border bg-surface hover:border-ink-muted",
      ].join(" ")}
    >
      <svg aria-hidden viewBox="0 0 24 24" className={`${compact ? "size-6" : "size-9"} text-ink-muted`} fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      </svg>
      <span className={`${compact ? "text-sm" : "text-base"} font-medium text-ink`}>
        Déposez l&apos;export Google Ads ici, ou <span className="text-accent underline underline-offset-2">parcourez</span>
      </span>
      <span className="text-xs text-ink-muted">
        Rapport Campagnes en .xlsx ou .csv · plusieurs fichiers possibles (un par compte)
      </span>
      <input
        id={inputId}
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          // Reset so that choosing the same file again fires onChange.
          event.target.value = "";
          if (files.length > 0) onFiles(files);
        }}
      />
    </label>
  );
}
