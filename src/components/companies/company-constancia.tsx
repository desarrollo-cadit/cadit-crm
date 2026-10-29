"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type Vista = {
  corte: string;
  hoy: string;
  firmaConfigurada: boolean;
  grupos: {
    cohortId: string;
    curso: string;
    grupo: string | null;
    estado: "planificada" | "en_curso" | "finalizada";
    alumnos: number;
    avisos: { clasesSinLista: number; alumnosSinMarca: string[] };
  }[];
  sinFacturar: { nombre: string; grupos: string[] }[];
};

const ESTADO: Record<Vista["grupos"][number]["estado"], string> = {
  planificada: "por comenzar",
  en_curso: "en curso",
  finalizada: "finalizado",
};

function titulo(g: Vista["grupos"][number]): string {
  return g.grupo && g.grupo !== g.curso ? `${g.curso} - ${g.grupo}` : g.curso;
}

/**
 * 2026-10-29 — La constancia en PDF para la empresa: General (todos sus
 * grupos) o un grupo, a una fecha de corte (hoy por defecto). Los avisos son
 * para el staff y NUNCA van al PDF: personas de la empresa con inscripciones
 * no facturadas a ella, clases dictadas sin lista y faltas por no tener marca.
 */
export function CompanyConstancia({ companyId, companyName }: { companyId: string; companyName: string }) {
  const [vista, setVista] = useState<Vista | null>(null);
  const [error, setError] = useState(false);
  const [corte, setCorte] = useState<string>("");
  const [alcance, setAlcance] = useState<string>("");

  useEffect(() => {
    let vigente = true;
    const q = corte ? `?corte=${encodeURIComponent(corte)}` : "";
    fetch(`/api/companies/${companyId}/constancia/preview${q}`)
      .then((r) => (r.ok ? (r.json() as Promise<Vista>) : null))
      .then((v) => {
        if (!vigente) return;
        if (!v) {
          setError(true);
          return;
        }
        setError(false);
        setVista(v);
        if (!corte) setCorte(v.corte);
      })
      .catch(() => vigente && setError(true));
    return () => {
      vigente = false;
    };
  }, [companyId, corte]);

  if (error && !vista) {
    return <p className="text-sm text-destructive">No pudimos preparar la constancia. Probá de nuevo en un momento.</p>;
  }
  if (!vista) return <Skeleton className="h-24 w-full" />;
  if (vista.grupos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Para la constancia hacen falta inscripciones a grupos facturadas a {companyName}.
      </p>
    );
  }

  const elegidos = alcance ? vista.grupos.filter((g) => g.cohortId === alcance) : vista.grupos;
  const sinLista = elegidos.filter((g) => g.avisos.clasesSinLista > 0);
  const sinMarca = elegidos.flatMap((g) => g.avisos.alumnosSinMarca.map((n) => `${n} (${titulo(g)})`));
  const params = new URLSearchParams();
  if (alcance) params.set("cohortId", alcance);
  if (corte) params.set("corte", corte);
  const corteValido = /^\d{4}-\d{2}-\d{2}$/.test(corte);

  return (
    <section className="space-y-3 rounded-md border bg-card px-4 py-3" aria-labelledby={`constancia-${companyId}`}>
      <h3 id={`constancia-${companyId}`} className="flex items-center gap-2 text-sm font-semibold">
        <FileText className="h-4 w-4" aria-hidden /> Constancia para la empresa
      </h3>
      <p className="text-xs text-muted-foreground">
        Carta en PDF con la asistencia y el resultado de cada persona. El resultado final se informa
        solo cuando el profesor lo confirmó; mientras tanto figura «Resultado pendiente».
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1 space-y-1">
          <Label htmlFor={`alcance-${companyId}`}>Alcance</Label>
          <Select id={`alcance-${companyId}`} value={alcance} onChange={(e) => setAlcance(e.target.value)}>
            <option value="">General: todos sus grupos ({vista.grupos.length})</option>
            {vista.grupos.map((g) => (
              <option key={g.cohortId} value={g.cohortId}>
                {titulo(g)} · {ESTADO[g.estado]} · {g.alumnos} {g.alumnos === 1 ? "persona" : "personas"}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`corte-${companyId}`}>Fecha de corte</Label>
          <Input
            id={`corte-${companyId}`}
            type="date"
            value={corte}
            max={vista.hoy}
            onChange={(e) => setCorte(e.target.value)}
            className="w-44"
          />
        </div>
        <a
          href={corteValido ? `/api/companies/${companyId}/constancia?${params.toString()}` : undefined}
          aria-disabled={!corteValido}
          className={buttonVariants({ size: "sm" })}
        >
          <FileText className="h-4 w-4" aria-hidden /> Descargar constancia
        </a>
      </div>

      <ul className="flex flex-wrap gap-2 text-xs">
        {elegidos.map((g) => (
          <li key={g.cohortId}>
            <Badge variant={g.estado === "finalizada" ? "secondary" : "outline"}>
              {titulo(g)}: {ESTADO[g.estado]}
            </Badge>
          </li>
        ))}
      </ul>

      {(!vista.firmaConfigurada || vista.sinFacturar.length > 0 || sinLista.length > 0 || sinMarca.length > 0) && (
        <div className="space-y-2 rounded-md border border-warning-border bg-warning-soft p-3 text-xs">
          <p className="flex items-center gap-1.5 font-medium text-warning">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Antes de mandarla
          </p>
          {!vista.firmaConfigurada && (
            <p>
              No hay quién firme las constancias: sale con la línea de firma en blanco. Se configura
              en Configuración → Marca.
            </p>
          )}
          {vista.sinFacturar.length > 0 && (
            <div>
              <p>
                Hay {vista.sinFacturar.length}{" "}
                {vista.sinFacturar.length === 1 ? "persona" : "personas"} de {companyName} con
                inscripciones que no están facturadas a la empresa (no aparecen en la constancia):
              </p>
              <ul className="ml-4 list-disc">
                {vista.sinFacturar.map((p) => (
                  <li key={p.nombre}>
                    {p.nombre}: {p.grupos.join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {sinLista.map((g) => (
            <p key={g.cohortId}>
              {titulo(g)}: {g.avisos.clasesSinLista}{" "}
              {g.avisos.clasesSinLista === 1
                ? "clase dictada no tiene asistencia registrada y no cuenta"
                : "clases dictadas no tienen asistencia registrada y no cuentan"}{" "}
              para nadie.
            </p>
          ))}
          {sinMarca.length > 0 && (
            <div>
              <p>Sin marca en clases con lista tomada (revisar la planilla de asistencia):</p>
              <ul className="ml-4 list-disc">
                {sinMarca.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
