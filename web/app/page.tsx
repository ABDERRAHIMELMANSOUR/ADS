import { ReportBuilder } from "@/components/report/report-builder";

export default function ReportPage() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Rapport Google Ads</h1>
        <p className="text-sm text-ink-secondary">
          Importez le rapport Campagnes exporté de Google Ads pour obtenir les totaux par compte, service et type.
          Le fichier est lu dans votre navigateur : il n&apos;est envoyé à aucun serveur.
        </p>
      </header>
      <ReportBuilder />
    </main>
  );
}
