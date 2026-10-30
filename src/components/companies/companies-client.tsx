"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, ChevronDown, Combine, Download, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanyForm } from "@/components/companies/company-form";
import { CompanyOfflineCourses } from "@/components/companies/company-offline-courses";
import { MergeCompaniesDialog } from "@/components/companies/merge-companies-dialog";
import { CompanyConstancia } from "@/components/companies/company-constancia";
import {
  Buscador,
  Resaltado,
  ResumenDeFiltros,
  SinCoincidencias,
  TarjetaDeFiltros,
  type FiltroActivo,
} from "@/components/listados/filtros";
import { colorCategorico } from "@/lib/cohort-color";
import { condicionDePago } from "@/lib/company";
import { filtrarEmpresas, inicialesDeEmpresa } from "@/lib/company-filters";
import { ETIQUETA_DE_RESULTADO, type ResultadoDeCursada } from "@/lib/resultado-de-cursada";
import { cn } from "@/lib/utils";
import type { CompanyDto } from "@/lib/types";

/** 2026-10-30 — La fila del listado: el DTO de siempre más cuántas personas tiene. */
type CompanyRow = CompanyDto & { peopleCount?: number };

type ReportRow = {
  employeeName: string;
  email: string | null;
  cohortName: string;
  courseName: string;
  /** "8 de 10 clases (80%)", con "hasta hoy" si el grupo sigue en curso. */
  attendanceText: string | null;
  /**
   * 2026-10-29 — La MISMA regla que la constancia (`resultadoDeCursada`):
   * en curso no hay resultado, y terminado solo con la confirmación del profesor.
   */
  approval: ResultadoDeCursada;
  certificateCode: string | null;
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
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [busqueda, setBusqueda] = useState("");
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
      const data = (await res.json()) as { companies: CompanyRow[] };
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
      <div className="space-y-4 p-6" aria-busy="true">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-14 w-full" />
        <div className="divide-y overflow-hidden rounded-lg border bg-card">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3.5 px-4 py-[11px]">
              <Skeleton className="h-[38px] w-[38px] rounded-[11px]" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /**
   * 2026-10-30 — Como Académico: buscador en una tarjeta, "Mostrando N de M"
   * y filas en grilla. La regla de búsqueda es de `src/lib/company-filters.ts`.
   */
  const visibles = filtrarEmpresas(companies, busqueda);
  const filtrosActivos: FiltroActivo[] = busqueda.trim()
    ? [{ clave: "q", etiqueta: `“${busqueda.trim()}”`, quitar: () => setBusqueda("") }]
    : [];

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

      {!loadError && companies.length > 0 && (
        <TarjetaDeFiltros
          pie={
            <ResumenDeFiltros
              mostrando={visibles.length}
              total={companies.length}
              sustantivo={{ uno: "empresa", varios: "empresas" }}
              activos={filtrosActivos}
              onLimpiar={() => setBusqueda("")}
            />
          }
        >
          <Buscador
            value={busqueda}
            onChange={setBusqueda}
            placeholder="Buscar empresa por razón social, nombre comercial o RUT…"
          />
        </TarjetaDeFiltros>
      )}

      {companies.length > 0 && visibles.length === 0 && (
        <SinCoincidencias
          mensaje="Ninguna empresa coincide con la búsqueda."
          onLimpiar={() => setBusqueda("")}
        />
      )}

      {visibles.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-lg border bg-card">
          {visibles.map((c) => {
            const abiertaEsta = abierta === c.id;
            const color = colorCategorico(c.id);
            const condicion = condicionDePago(c.paymentTerms, c.paymentTermDays);
            const personas = c.peopleCount;
            return (
              <li key={c.id}>
                <div className="grid grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-x-3.5 px-4 py-[11px] transition-colors hover:bg-subtle md:grid-cols-[38px_minmax(0,2.2fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_auto]">
                  <span
                    aria-hidden
                    className={cn(
                      "grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[11px] text-[13px] font-semibold tracking-wide",
                      color.bg,
                      color.text
                    )}
                  >
                    {inicialesDeEmpresa(c)}
                  </span>
                  <button
                    type="button"
                    className="group min-w-0 text-left"
                    aria-expanded={abiertaEsta}
                    onClick={() => void abrir(c.id)}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-medium leading-snug group-hover:underline">
                        <Resaltado texto={c.legalName} busqueda={busqueda} />
                      </span>
                      <ChevronDown
                        aria-hidden
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 text-text-4 transition-transform",
                          abiertaEsta && "rotate-180"
                        )}
                      />
                    </span>
                    {(c.tradeName || condicion) && (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {c.tradeName && <Resaltado texto={c.tradeName} busqueda={busqueda} />}
                        {c.tradeName && condicion && " · "}
                        {condicion}
                      </span>
                    )}
                    {c.taxId && (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground md:hidden">
                        RUT <Resaltado texto={c.taxId} busqueda={busqueda} />
                      </span>
                    )}
                  </button>
                  <div className="hidden min-w-0 truncate text-[13px] tabular-nums text-text-2 md:block">
                    {c.taxId ? (
                      <>
                        RUT <Resaltado texto={c.taxId} busqueda={busqueda} />
                      </>
                    ) : (
                      <span className="text-muted-foreground">Sin RUT</span>
                    )}
                  </div>
                  <div className="hidden text-[13px] text-text-2 md:block">
                    {personas === undefined ? null : personas === 0 ? (
                      <span className="text-muted-foreground">Sin personas</span>
                    ) : (
                      `${personas} ${personas === 1 ? "persona" : "personas"}`
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Editar ${c.legalName}`}
                        title="Editar"
                        onClick={() => {
                          setEditando(c.id);
                          setAbierta(c.id);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
                      </Button>
                    )}
                    {canMerge && companies.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Unificar ${c.legalName} con…`}
                        title="Unificar con…"
                        onClick={() => setUnificando(c)}
                      >
                        <Combine className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
                      </Button>
                    )}
                    {/* El CSV es la misma ruta con `?format=csv`: misma información,
                        distinto envase. */}
                    <a
                      href={`/api/companies/${c.id}/report?format=csv`}
                      aria-label={`Exportar CSV de ${c.legalName}`}
                      title="Exportar CSV"
                      className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-8 w-8")}
                    >
                      <Download className="h-3.5 w-3.5" strokeWidth={1.8} />
                    </a>
                  </div>
                </div>
    
                {abiertaEsta && (
                  <div className="space-y-3 border-t bg-subtle px-4 py-3">
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
                              {r.attendanceText === null
                                ? "sin asistencia registrada"
                                : `Asistió a ${r.attendanceText}`}
                            </span>
                            <Badge variant="outline">{ETIQUETA_DE_RESULTADO[r.approval]}</Badge>
                            {r.certificateCode && (
                              <Badge variant="secondary">
                                Certificado {r.certificateCode}
                              </Badge>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {/* 2026-10-29 — La constancia en PDF para mandarle a la empresa. */}
                    <CompanyConstancia companyId={c.id} companyName={c.legalName} />
                    {/* 045 — Cursos offline de su gente (acceso directo, 043). */}
                    <CompanyOfflineCourses companyId={c.id} canEdit={canEditAcademic} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

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
