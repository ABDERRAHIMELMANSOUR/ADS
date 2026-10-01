"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";

export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col items-start gap-3 px-4 py-10 sm:px-6">
      <h1 className="text-lg font-semibold text-ink">Une erreur est survenue</h1>
      <p className="text-sm text-ink-secondary">
        La page n&apos;a pas pu s&apos;afficher. Réessayez ; si le problème persiste, rechargez la page.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink"
      >
        Réessayer
      </button>
    </main>
  );
}
