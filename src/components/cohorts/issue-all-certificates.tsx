"use client";

import { useState } from "react";
import { Award, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";

/**
 * 038 (FR-009/FR-010) — "Emitir a todos los aprobados", con el resultado.
 *
 * Un solo botón para la cohorte entera (SC-002) y, debajo, qué pasó con cada
 * uno: emitido, ya lo tenía, o por qué no. El panel no se cierra solo: la
 * lista de quién no aprobó es justamente lo que la coordinación tiene que
 * leer con calma.
 *
 * El servidor decide todo (`emitirATodos`): esto solo dibuja. Solo se monta
 * con `certificados.emitir` (US2, escenario 5); la ruta lo exige igual.
 */

type Resultado = {
  enrollmentId: string;
  alumno: string;
  certificado: string;
  estado: "emitido" | "ya_emitido" | "no_aprobado" | "sin_confirmar" | "grupo_incompleto" | "no_terminado" | "no_emitido";
  motivo: string | null;
};

const GRUPOS: { estado: Resultado["estado"]; titulo: string; variant: "success" | "secondary" | "outline" | "destructive" }[] = [
  { estado: "emitido", titulo: "Emitidos ahora", variant: "success" },
  { estado: "ya_emitido", titulo: "Ya lo tenían", variant: "secondary" },
  { estado: "no_terminado", titulo: "La cursada no terminó", variant: "outline" },
  { estado: "sin_confirmar", titulo: "Resultado final sin confirmar", variant: "outline" },
  { estado: "grupo_incompleto", titulo: "Grupo sin asistencia completa", variant: "outline" },
  { estado: "no_aprobado", titulo: "No aprobados", variant: "destructive" },
  { estado: "no_emitido", titulo: "No se emitió", variant: "outline" },
];

export function IssueAllCertificates({
  cohortId,
  especializacion = false,
  onDone,
}: {
  cohortId: string;
  /** Cambia solo el texto: el servidor sabe qué es la cohorte. */
  especializacion?: boolean;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [resultados, setResultados] = useState<Resultado[] | null>(null);

  async function emitir() {
    setBusy(true);
    const res = await fetch(`/api/cohorts/${cohortId}/certificates`, { method: "POST" }).catch(
      () => null
    );
    setBusy(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      notify.error(body?.error?.message ?? "No se pudieron emitir los certificados");
      return;
    }
    const body = (await res.json()) as { resultados: Resultado[] };
    setResultados(body.resultados);
    const nuevos = body.resultados.filter((r) => r.estado === "emitido").length;
    notify.success(
      nuevos === 0
        ? "No había certificados nuevos para emitir."
        : `${nuevos} ${nuevos === 1 ? "certificado emitido" : "certificados emitidos"}.`
    );
    onDone?.();
  }

  return (
    <div className="space-y-3">
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void emitir()}>
        <Award className="h-4 w-4" />
        {busy
          ? "Emitiendo…"
          : especializacion
            ? "Emitir a todos los aprobados (módulos y general)"
            : "Emitir a todos los aprobados"}
      </Button>

      {resultados && (
        <section
          aria-label="Resultado de la emisión"
          className="space-y-3 rounded-lg border bg-card p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium">
              Resultado de la emisión · {resultados.length}{" "}
              {resultados.length === 1 ? "certificado revisado" : "certificados revisados"}
            </p>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Cerrar el resultado"
              onClick={() => setResultados(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {resultados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este grupo no tiene alumnos inscriptos.</p>
          ) : (
            GRUPOS.map((g) => {
              const filas = resultados.filter((r) => r.estado === g.estado);
              if (filas.length === 0) return null;
              return (
                <div key={g.estado} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={g.variant}>{g.titulo}</Badge>
                    <span className="text-xs text-muted-foreground">{filas.length}</span>
                  </div>
                  <ul className="space-y-0.5 text-sm">
                    {filas.map((r) => (
                      <li key={`${r.enrollmentId}-${r.certificado}`}>
                        <span className="font-medium">{r.alumno}</span>
                        <span className="text-muted-foreground"> · {r.certificado}</span>
                        {r.motivo && (
                          <span className="block text-xs text-muted-foreground">{r.motivo}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </section>
      )}
    </div>
  );
}
