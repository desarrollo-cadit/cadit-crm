"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Combine, Download, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanyForm } from "@/components/companies/company-form";
import { CompanyOfflineCourses } from "@/components/companies/company-offline-courses";
import { MergeCompaniesDialog } from "@/components/companies/merge-companies-dialog";
import { condicionDePago } from "@/lib/company";
import type { CompanyDto } from "@/lib/types";

type ReportRow = {
  employeeName: string;
  email: string | null;
  cohortName: string;
  courseName: string;
  attendancePct: number | null;
  minAttendancePct: number | null;
  approval: "aprobado" | "reprobado" | "pendiente" | "sin_datos";
  certificateCode: string | null;
};

const ESTADO: Record<ReportRow["approval"], string> = {
  aprobado: "Aprobado",
  reprobado: "No aprobado",
  pendiente: "En curso",
  sin_datos: "Sin datos",
};

/** 040 — Una línea de la ficha; si no hay dato, lo dice en vez de esconder la fila. */
function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm">{children || <span className="text-muted-foreground">Sin cargar</span>}</dd>
    </div>
  );
}

/**
 * 040 (FR-006) — Los datos de facturación, arriba del reporte de empleados:
 * es lo que Administración viene a buscar cuando abre la empresa.
 */
function FichaDeFacturacion({ c }: { c: CompanyDto }) {
  const direccion = [c.addressStreet, c.addressCity, c.addressState, c.addressCountry]
    .filter(Boolean)
    .join(", ");
  return (
    <dl className="grid gap-x-6 gap-y-3 rounded-md border bg-card px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
      <Dato label="Razón social">{c.legalName}</Dato>
      <Dato label="Nombre comercial">{c.tradeName}</Dato>
      <Dato label="RUT">{c.taxId}</Dato>
      <Dato label="Dirección fiscal">{direccion}</Dato>
      <Dato label="A quién se le factura">{c.billingContactName}</Dato>
      <Dato label="Correo de facturación">{c.billingEmail}</Dato>
      <Dato label="Teléfono">{c.billingPhone}</Dato>
      <Dato label="Condición de pago">{condicionDePago(c.paymentTerms, c.paymentTermDays)}</Dato>
      {c.notes && (
        <div className="sm:col-span-2 lg:col-span-3">
          <dt className="text-xs text-muted-foreground">Notas</dt>
          <dd className="whitespace-pre-line text-sm">{c.notes}</dd>
        </div>
      )}
    </dl>
  );
}

/**
 * 013 (T033, FR-010c) — Empresas y el avance de sus empleados.
 *
 * Esta pantalla **sustituye al portal corporativo**, descartado por el dueño:
 * la necesidad real era "¿cómo van mis empleados?", y se resuelve con un
 * reporte que el staff mira y exporta, no con una tercera audiencia con login
 * y permisos propios.
 *
 * 040 — Suma el alta y la edición con los datos de facturación. Los botones
 * se dibujan solo con `empresas.editar` (lo decide el servidor y baja como
 * booleano); las rutas tienen su propio `requireCapability`.
 *
 * 2026-10-29 — «Unificar con…» solo con `empresas.unificar` (`canMerge`).
 */
export function CompaniesClient({
  canEdit,
  canEditAcademic,
  canMerge = false,
}: {
  canEdit: boolean;
  /** 2026-10-29 — `empresas.unificar`: juntar dos empresas duplicadas. */
  canMerge?: boolean;
  /** 045 — `academico.editar`: asignar, extender y quitar cursos offline de la empresa. */
  canEditAcademic: boolean;
}) {
  const [companies, setCompanies] = useState<CompanyDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [cargandoReporte, setCargandoReporte] = useState(false);
  /** `"nueva"` = alta; un id = editando esa empresa; `null` = ningún formulario. */
  const [editando, setEditando] = useState<string | null>(null);
  /** La empresa desde la que se abrió «Unificar con…» (la que queda por defecto). */
  const [unificando, setUnificando] = useState<CompanyDto | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/companies").catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { companies: CompanyDto[] };
      setCompanies(data.companies);
      setLoadError(false);
    } else {
      setLoadError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function abrir(id: string) {
    if (abierta === id) {
      setAbierta(null);
      return;
    }
    setAbierta(id);
    setCargandoReporte(true);
    setRows([]);
    const res = await fetch(`/api/companies/${id}/report`).catch(() => null);
    setCargandoReporte(false);
    if (res?.ok) {
      const data = (await res.json()) as { rows: ReportRow[] };
      setRows(data.rows);
    }
  }

  function guardada(c: CompanyDto) {
    setEditando(null);
    setAbierta(c.id);
    void refetch();
  }

  if (loading) {
    return (
      <div className="space-y-2 p-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Building2 className="h-5 w-5" />
            Empresas
          </h2>
          <p className="text-sm text-muted-foreground">
            Sus datos de facturación, los empleados inscriptos, su asistencia y si
            aprobaron. El reporte se exporta para mandárselo a la empresa.
          </p>
        </div>
        {canEdit && editando !== "nueva" && (
          <Button size="sm" onClick={() => setEditando("nueva")}>
            <Plus className="h-4 w-4" /> Nueva empresa
          </Button>
        )}
      </header>

      {canEdit && editando === "nueva" && (
        <CompanyForm company={null} onSaved={guardada} onCancel={() => setEditando(null)} />
      )}

      {loadError && (
        <p className="text-sm text-destructive">
          No pudimos cargar las empresas. Podés recargar la página en un momento.
        </p>
      )}

      {!loadError && companies.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Todavía no hay empresas cargadas.
          {canEdit ? " Creá la primera con «Nueva empresa»." : " Se asignan al inscribir a un alumno."}
        </p>
      )}

      <ul className="divide-y rounded-md border">
        {companies.map((c) => (
          <li key={c.id}>
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <button
                type="button"
                className="min-w-0 flex-1 text-left text-sm font-medium hover:underline"
                aria-expanded={abierta === c.id}
                onClick={() => void abrir(c.id)}
              >
                {c.legalName}
                {c.tradeName && (
                  <span className="ml-2 font-normal text-muted-foreground">{c.tradeName}</span>
                )}
              </button>
              {c.taxId && <span className="text-xs text-muted-foreground">RUT {c.taxId}</span>}
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditando(c.id);
                    setAbierta(c.id);
                  }}
                >
                  <Pencil className="h-4 w-4" /> Editar
                </Button>
              )}
              {canMerge && companies.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => setUnificando(c)}>
                  <Combine className="h-4 w-4" aria-hidden /> Unificar con…
                </Button>
              )}
              {/* El CSV es la misma ruta con `?format=csv`: misma información,
                  distinto envase. */}
              <a
                href={`/api/companies/${c.id}/report?format=csv`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Download className="h-4 w-4" />
                Exportar CSV
              </a>
            </div>

            {abierta === c.id && (
              <div className="space-y-3 border-t bg-muted px-4 py-3">
                {canEdit && editando === c.id ? (
                  <CompanyForm company={c} onSaved={guardada} onCancel={() => setEditando(null)} />
                ) : (
                  <FichaDeFacturacion c={c} />
                )}
                {cargandoReporte ? (
                  <Skeleton className="h-16 w-full" />
                ) : rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Esta empresa todavía no tiene empleados inscriptos.
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {rows.map((r, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span className="font-medium">{r.employeeName}</span>
                        <span className="text-muted-foreground">{r.cohortName}</span>
                        <span>
                          {r.attendancePct === null
                            ? "sin asistencia registrada"
                            : `${r.attendancePct}%`}
                        </span>
                        <Badge variant="outline">{ESTADO[r.approval]}</Badge>
                        {r.certificateCode && (
                          <Badge variant="secondary">
                            Certificado {r.certificateCode}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {/* 045 — Cursos offline de su gente (acceso directo, 043). */}
                <CompanyOfflineCourses companyId={c.id} canEdit={canEditAcademic} />
              </div>
            )}
          </li>
        ))}
      </ul>

      {canMerge && unificando && (
        <MergeCompaniesDialog
          company={unificando}
          companies={companies}
          onClose={() => setUnificando(null)}
          onMerged={() => {
            setUnificando(null);
            setEditando(null);
            setAbierta(null);
            void refetch();
          }}
        />
      )}
    </div>
  );
}
