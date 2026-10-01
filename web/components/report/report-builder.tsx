"use client";

import { type ReactNode, useState } from "react";

import { formatDate, formatIsoDate } from "@/lib/format";
import { buildReport } from "@/lib/report/aggregate";
import { ExportFormatError, type ParsedExport, parseExportFile } from "@/lib/report/parse";
import { COMPTES, type Compte, classifyCompte } from "@/lib/report/rules";

import { FileDropzone } from "./file-dropzone";
import { RapportGlobalTable, TotalParCompteTable, TotalParServiceTable, UnclassifiedTable } from "./report-tables";

type UploadedFile = {
  id: string;
  fileName: string;
  compte: Compte | "auto";
} & (
  | { status: "parsing" }
  | { status: "ready"; parsed: ParsedExport }
  | { status: "error"; error: string }
);

type ReadyFile = Extract<UploadedFile, { status: "ready" }>;

const fileId = (file: File) => `${file.name}|${file.size}|${file.lastModified}`;

export function ReportBuilder() {
  const [files, setFiles] = useState<UploadedFile[]>([]);

  const readyFiles = files.filter((file): file is ReadyFile => file.status === "ready");
  // A few hundred campaign rows at most: cheap enough to rebuild on every render.
  const report = buildReport(
    readyFiles.map((file) => ({ fileName: file.fileName, rows: file.parsed.rows, compte: file.compte })),
  );

  function update(id: string, change: (file: UploadedFile) => UploadedFile) {
    setFiles((current) => current.map((file) => (file.id === id ? change(file) : file)));
  }

  function addFiles(selected: File[]) {
    const known = new Set(files.map((file) => file.id));
    // The same export dropped twice would be counted twice.
    const fresh = selected.filter((file) => !known.has(fileId(file)));
    setFiles((current) => [
      ...current,
      ...fresh.map((file): UploadedFile => ({ id: fileId(file), fileName: file.name, compte: "auto", status: "parsing" })),
    ]);

    for (const file of fresh) {
      parseExportFile(file)
        .then((parsed) => update(fileId(file), (entry) => ({ ...entry, status: "ready", parsed })))
        .catch((error: unknown) =>
          update(fileId(file), (entry) => ({
            ...entry,
            status: "error",
            error:
              error instanceof ExportFormatError
                ? error.message
                : "Fichier illisible. Exportez le rapport Campagnes de Google Ads en .xlsx ou .csv.",
          })),
        );
    }
  }

  // Same period written in French in one file and in English in another
  // still counts as one period.
  const periods = [
    ...new Set(
      readyFiles.map(({ parsed: { period } }) =>
        !period ? null : period.from && period.to ? `du ${formatIsoDate(period.from)} au ${formatIsoDate(period.to)}` : period.text,
      ),
    ),
  ].filter((period) => period !== null);

  return (
    <div className="flex flex-col gap-6">
      <FileDropzone onFiles={addFiles} compact={files.length > 0} />

      {files.length > 0 && (
        <section aria-label="Fichiers importés" className="rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <h2 className="text-sm font-semibold text-ink">Fichiers importés</h2>
            <button type="button" onClick={() => setFiles([])} className="text-xs text-ink-secondary hover:text-ink">
              Tout retirer
            </button>
          </div>
          <ul className="divide-y divide-border border-t border-border">
            {files.map((file) => (
              <FileItem
                key={file.id}
                file={file}
                onCompteChange={(compte) => update(file.id, (entry) => ({ ...entry, compte }))}
                onRemove={() => setFiles((current) => current.filter((entry) => entry.id !== file.id))}
              />
            ))}
          </ul>
        </section>
      )}

      {readyFiles.length > 0 && (
        <>
          <dl className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-ink-secondary">Date du rapport</dt>
              <dd className="font-medium text-ink">{formatDate(new Date())}</dd>
            </div>
            {periods.length > 0 && (
              <div className="flex gap-2">
                <dt className="text-ink-secondary">Période</dt>
                <dd className="font-medium text-ink">{periods.join(" · ")}</dd>
              </div>
            )}
          </dl>

          {periods.length > 1 && (
            <Notice>Les fichiers importés couvrent des périodes différentes : les totaux les additionnent.</Notice>
          )}
          {report.unclassified.length > 0 && (
            <Notice>
              {report.unclassified.length} campagne(s) non classée(s) sont exclues des totaux. Le détail est en bas de
              page.
            </Notice>
          )}

          <RapportGlobalTable report={report} />
          <TotalParCompteTable report={report} />
          <TotalParServiceTable report={report} />
          {report.unclassified.length > 0 && <UnclassifiedTable report={report} />}
        </>
      )}
    </div>
  );
}

function FileItem({
  file,
  onCompteChange,
  onRemove,
}: {
  file: UploadedFile;
  onCompteChange: (compte: Compte | "auto") => void;
  onRemove: () => void;
}) {
  const detected =
    file.status === "ready"
      ? [...new Set(file.parsed.rows.map((row) => classifyCompte(row.account, row.campaign, file.fileName)))]
          .filter((compte) => compte !== null)
          .sort()
      : [];

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
      <div className="min-w-0 basis-full sm:flex-1">
        <p className="truncate font-medium text-ink">{file.fileName}</p>
        {file.status === "parsing" && <p className="text-xs text-ink-muted">Lecture du fichier…</p>}
        {file.status === "error" && <p className="text-xs text-critical">{file.error}</p>}
        {file.status === "ready" && (
          <p className="text-xs text-ink-muted">
            {file.parsed.rows.length} campagne(s)
            {file.parsed.period && <> · {file.parsed.period.text}</>}
            {file.parsed.warnings.map((warning) => (
              <span key={warning} className="block text-ink-secondary">
                {warning}
              </span>
            ))}
          </p>
        )}
      </div>

      {file.status === "ready" && (
        <label className="flex items-center gap-2 text-xs text-ink-secondary">
          Compte
          <select
            value={file.compte}
            onChange={(event) => onCompteChange(event.target.value as Compte | "auto")}
            className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-ink"
          >
            <option value="auto">
              Détection auto{detected.length > 0 ? ` (${detected.join(", ")})` : ""}
            </option>
            {COMPTES.map((compte) => (
              <option key={compte} value={compte}>
                {compte}
              </option>
            ))}
          </select>
        </label>
      )}

      <button type="button" onClick={onRemove} className="text-xs text-ink-secondary hover:text-ink">
        Retirer
      </button>
    </li>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm text-ink">
      {children}
    </p>
  );
}
