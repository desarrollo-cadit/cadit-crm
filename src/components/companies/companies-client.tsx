"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** La tabla la llama `legal_name`: es la razón social, no un apodo. */
type Company = { id: string; legalName: string };

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

/**
 * 013 (T033, FR-010c) — Empresas y el avance de sus empleados.
 *
 * Esta pantalla **sustituye al portal corporativo**, descartado por el dueño:
 * la necesidad real era "¿cómo van mis empleados?", y se resuelve con un
 * reporte que el staff mira y exporta, no con una tercera audiencia con login
 * y permisos propios. Con 5 empresas y 14 inscripciones, un portal habría sido
 * construir un edificio para una persona.
 */
export function CompaniesClient() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [cargandoReporte, setCargandoReporte] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/companies").catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { companies: Company[] };
      setCompanies(data.companies);
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
      <header>
        <h2 className="flex items-center gap-2 font-semibold">
          <Building2 className="h-5 w-5" />
          Empresas
        </h2>
        <p className="text-sm text-muted-foreground">
          Empleados inscriptos, su asistencia y si aprobaron. El reporte se
          exporta para mandárselo a la empresa.
        </p>
      </header>

      {companies.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Todavía no hay empresas cargadas. Se asignan al inscribir a un alumno.
        </p>
      )}

      <ul className="divide-y rounded-md border">
        {companies.map((c) => (
          <li key={c.id}>
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                className="flex-1 text-left text-sm font-medium hover:underline"
                aria-expanded={abierta === c.id}
                onClick={() => void abrir(c.id)}
              >
                {c.legalName}
              </button>
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
              <div className="border-t bg-muted px-4 py-3">
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
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
