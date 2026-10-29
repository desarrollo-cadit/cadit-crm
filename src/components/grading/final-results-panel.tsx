"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCheck, ClipboardCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { notify } from "@/lib/notify";
import { sugeridosAConfirmar, type ResultadoFinal } from "@/lib/resultado-final";

type Estado = "aprobado" | "reprobado" | "pendiente";

type Fila = {
  enrollmentId: string;
  nombre: string;
  asistencia: { presentes: number; cuentan: number; pct: number | null };
  evaluaciones: { obligatorias: number; aprobadas: number; reprobadas: number; sinCorregir: number };
  sugerido: Estado;
  razones: string[];
  confirmado: {
    result: ResultadoFinal;
    suggestedResult: Estado;
    note: string | null;
    confirmedAt: string;
    confirmedByName: string | null;
  } | null;
  porModulos: boolean;
  /** Solo viaja al staff. */
  certificado?: "ninguno" | "vigente" | "suspendido" | "anulado";
};

type Cierre = {
  cohortId: string;
  estadoDelGrupo: "planificada" | "en_curso" | "finalizada";
  confirmable: boolean;
  /** 2026-10-29 — toda clase dictada con la asistencia tomada. */
  grupoCompleto?: boolean;
  minAttendancePct: number | null;
  alumnos: Fila[];
};

const SUGERENCIA: Record<Estado, { label: string; variant: "success" | "destructive" | "warning" }> = {
  aprobado: { label: "Sugiere aprobado", variant: "success" },
  reprobado: { label: "Sugiere reprobado", variant: "destructive" },
  pendiente: { label: "Sin sugerencia", variant: "warning" },
};

function textoDeAsistencia(a: Fila["asistencia"]): string {
  if (a.cuentan === 0 || a.pct === null) return "Sin registro";
  return `${a.presentes} de ${a.cuentan} ${a.cuentan === 1 ? "clase" : "clases"} (${a.pct}%)`;
}

function textoDeEvaluaciones(e: Fila["evaluaciones"]): string {
  if (e.obligatorias === 0) return "Sin obligatorias";
  const partes = [`${e.aprobadas} de ${e.obligatorias} aprobadas`];
  if (e.reprobadas > 0) partes.push(`${e.reprobadas} desaprobadas`);
  if (e.sinCorregir > 0) partes.push(`${e.sinCorregir} sin corregir`);
  return partes.join(" · ");
}

/**
 * 0086 — Cerrar la cursada: el resultado final de cada alumno.
 *
 * Decisión del dueño (2026-10-23): ninguna aprobación es automática. La
 * sugerencia (notas + asistencia) es un punto de partida; quien confirma
 * puede aprobar o reprobar más allá de ella. Nada se confirma solo: "Confirmar
 * sugeridos" también es un clic, y pide confirmación.
 *
 * Lo usan las dos puertas con su propio endpoint: el portal del profesor
 * (`/api/portal/cohorts/[id]/final-results`) y la planilla del staff
 * (`/api/cohorts/[id]/final-results`). El servidor decide quién puede; esto
 * solo dibuja.
 */
export function FinalResultsPanel({
  endpoint,
  canConfirm,
  audiencia,
  onCambio,
}: {
  endpoint: string;
  /** Avisa que se confirmó algo (la planilla del staff vuelve a leer la emisión). */
  onCambio?: () => void;
  /** Staff: `correcciones.aprobar`. Profesor: siempre (su alcance lo decide el servidor). */
  canConfirm: boolean;
  audiencia: "staff" | "profesor";
}) {
  const [cierre, setCierre] = useState<Cierre | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmandoSugeridos, setConfirmandoSugeridos] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch(endpoint).catch(() => null);
    if (!res?.ok) {
      setError("No se pudo cargar el resultado final del grupo.");
      return;
    }
    setCierre((await res.json()) as Cierre);
    setError(null);
  }, [endpoint]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function enviar(entries: { enrollmentId: string; result: ResultadoFinal }[], clave: string) {
    setBusy(clave);
    const res = await fetch(endpoint, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entries }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      notify.error(body?.error?.message ?? "No se pudo guardar el resultado final");
      return;
    }
    const data = (await res.json()) as { confirmados: number; certificadosAnulados: number };
    notify.success(
      data.confirmados === 1 ? "Resultado confirmado." : `${data.confirmados} resultados confirmados.`,
      data.certificadosAnulados > 0
        ? {
            description:
              data.certificadosAnulados === 1
                ? "Se anuló 1 certificado por resultado reprobado."
                : `Se anularon ${data.certificadosAnulados} certificados por resultado reprobado.`,
          }
        : undefined
    );
    setConfirmandoSugeridos(false);
    void refetch();
    onCambio?.();
  }

  if (error && !cierre) {
    return (
      <section className="space-y-2 rounded-lg border p-4">
        <p className="text-sm text-danger">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Reintentar
        </Button>
      </section>
    );
  }
  if (!cierre) return <Skeleton className="h-24 w-full" />;

  const editable = canConfirm && cierre.confirmable;
  const sugeridos = sugeridosAConfirmar(
    cierre.alumnos
      .filter((a) => !a.porModulos)
      .map((a) => ({
        enrollmentId: a.enrollmentId,
        sugerido: a.sugerido,
        confirmado: a.confirmado?.result ?? null,
      }))
  );
  const sinConfirmar = cierre.alumnos.filter((a) => !a.porModulos && !a.confirmado).length;

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ClipboardCheck className="h-4 w-4" aria-hidden />
            Cerrar cursada · Resultado final
          </h3>
          <p className="text-xs text-muted-foreground">
            {audiencia === "profesor"
              ? "El resultado final lo confirmás vos. La sugerencia sale de las notas y la asistencia; podés aprobar o reprobar más allá de ella."
              : "El resultado final lo confirma el profesor del grupo (o Coordinación). La sugerencia sale de las notas y la asistencia; no aprueba a nadie sola."}{" "}
            Sin resultado confirmado no se emite el certificado, y confirmar “reprobado” anula el
            certificado que ya se hubiera emitido.
          </p>
          {cierre.estadoDelGrupo !== "finalizada" && (
            <p className="text-xs font-medium text-warning">
              Vas a poder confirmar los resultados cuando el grupo termine.
            </p>
          )}
          {cierre.estadoDelGrupo === "finalizada" && cierre.grupoCompleto === false && (
            <p className="text-xs font-medium text-warning">
              Este grupo terminó sin la asistencia completa: no tiene resultado final. Para
              confirmarlo, primero hay que pasar lista en todas las clases dictadas.
            </p>
          )}
          {cierre.confirmable && sinConfirmar > 0 && (
            <p className="text-xs font-medium text-warning">
              {sinConfirmar === 1
                ? "Falta confirmar 1 resultado."
                : `Faltan confirmar ${sinConfirmar} resultados.`}
            </p>
          )}
        </div>
        {editable && sugeridos.length > 0 && !confirmandoSugeridos && (
          <Button size="sm" variant="outline" onClick={() => setConfirmandoSugeridos(true)}>
            <CheckCheck className="h-4 w-4" aria-hidden />
            Confirmar sugeridos ({sugeridos.length})
          </Button>
        )}
      </div>

      {editable && confirmandoSugeridos && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-subtle p-3 text-xs">
          <span className="text-foreground">
            Se van a confirmar {sugeridos.length}{" "}
            {sugeridos.length === 1 ? "resultado" : "resultados"} tal como los sugiere el sistema.
            Los que no tienen sugerencia quedan para que los decidas uno por uno.
          </span>
          <Button
            size="sm"
            loading={busy === "sugeridos"}
            onClick={() => void enviar(sugeridos, "sugeridos")}
          >
            Confirmar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmandoSugeridos(false)}>
            Cancelar
          </Button>
        </div>
      )}

      {cierre.alumnos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Este grupo no tiene alumnos.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader className="bg-subtle">
              <TableRow>
                <TableHead>Alumno</TableHead>
                <TableHead>Asistencia</TableHead>
                <TableHead>Evaluaciones obligatorias</TableHead>
                <TableHead>Sugerencia</TableHead>
                <TableHead>Resultado final</TableHead>
                {editable && <TableHead className="text-right">Confirmar</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {cierre.alumnos.map((a) => (
                <TableRow key={a.enrollmentId}>
                  <TableCell className="font-medium">{a.nombre}</TableCell>
                  <TableCell className="text-xs">{textoDeAsistencia(a.asistencia)}</TableCell>
                  <TableCell className="text-xs">{textoDeEvaluaciones(a.evaluaciones)}</TableCell>
                  <TableCell>
                    <Badge variant={SUGERENCIA[a.sugerido].variant}>{SUGERENCIA[a.sugerido].label}</Badge>
                    {a.razones.length > 0 && (
                      <span className="block text-[10px] text-muted-foreground">{a.razones.join(" · ")}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {a.porModulos ? (
                      <span className="text-muted-foreground">Se confirma en cada módulo</span>
                    ) : a.confirmado ? (
                      <div className="space-y-0.5">
                        <Badge variant={a.confirmado.result === "aprobado" ? "success" : "destructive"}>
                          {a.confirmado.result === "aprobado" ? "Aprobado" : "Reprobado"}
                        </Badge>
                        <p className="text-[10px] text-muted-foreground">
                          Confirmado
                          {a.confirmado.confirmedByName ? ` por ${a.confirmado.confirmedByName}` : ""} el{" "}
                          {new Date(a.confirmado.confirmedAt).toLocaleDateString("es-UY")}
                          {a.confirmado.note ? ` · ${a.confirmado.note}` : ""}
                        </p>
                      </div>
                    ) : (
                      <Badge variant="warning">Sin confirmar</Badge>
                    )}
                    {a.certificado === "suspendido" && (
                      <p className="text-[10px] text-warning">Certificado suspendido hasta confirmar</p>
                    )}
                  </TableCell>
                  {editable && (
                    <TableCell className="text-right">
                      {!a.porModulos && (
                        <div className="flex justify-end gap-1">
                          {a.confirmado?.result !== "aprobado" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy !== null}
                              loading={busy === `${a.enrollmentId}:aprobado`}
                              onClick={() =>
                                void enviar(
                                  [{ enrollmentId: a.enrollmentId, result: "aprobado" }],
                                  `${a.enrollmentId}:aprobado`
                                )
                              }
                            >
                              Aprobar
                            </Button>
                          )}
                          {a.confirmado?.result !== "reprobado" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy !== null}
                              loading={busy === `${a.enrollmentId}:reprobado`}
                              title={
                                a.certificado === "vigente" || a.certificado === "suspendido"
                                  ? "Reprobar anula el certificado ya emitido"
                                  : undefined
                              }
                              onClick={() =>
                                void enviar(
                                  [{ enrollmentId: a.enrollmentId, result: "reprobado" }],
                                  `${a.enrollmentId}:reprobado`
                                )
                              }
                            >
                              Reprobar
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
