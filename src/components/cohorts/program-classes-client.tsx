"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { ResourcesPanel, useClassMaterial } from "@/components/academic/resources-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Fila = {
  id: string | null;
  number: number;
  projected: boolean;
  date: string;
  startTime: string | null;
  endTime: string | null;
  topic: string | null;
  canceled: boolean;
};

type ModuloConClases = {
  cohortId: string;
  label: string;
  projected: boolean;
  cannotGenerateReason: string | null;
  classes: Fila[];
};

type Payload = { cohortId: string; timezone: string; modules: ModuloConClases[] };

type Resumen = {
  generated: { cohortId: string; label: string; classes: number }[];
  skipped: { cohortId: string; label: string; message: string }[];
};

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-UY", { weekday: "short", day: "2-digit", month: "short" });

/**
 * 029 — La pestaña Clases de una ESPECIALIZACIÓN: las clases de sus módulos,
 * agrupadas por módulo y en el orden del programa.
 *
 * La madre no tiene clases propias (DV-009) y esta pestaña quedaba vacía.
 * Acá se ven, se enlaza cada módulo —donde se editan enlaces, aulas y
 * asistencia— y se genera el cronograma de todos los que falten en UN pedido.
 * El material también llega en un solo pedido para todos los módulos.
 */
export function ProgramClassesClient({
  cohortId,
  canEdit,
}: {
  cohortId: string;
  /** `academico.editar` — generar cronogramas y cargar material. */
  canEdit: boolean;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const material = useClassMaterial(cohortId);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/cohorts/${cohortId}/modules/classes`).catch(() => null);
    if (!res?.ok) {
      setError("No se pudieron cargar las clases de los módulos");
      return;
    }
    setData((await res.json()) as Payload);
    setError(null);
  }, [cohortId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function generarTodos() {
    setGenerando(true);
    setError(null);
    const res = await fetch(`/api/cohorts/${cohortId}/modules/schedule`, {
      method: "POST",
    }).catch(() => null);
    setGenerando(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(body?.error?.message ?? "No se pudo generar el cronograma de los módulos");
      return;
    }
    setResumen((await res.json()) as Resumen);
    void refetch();
  }

  if (!data) {
    return error ? (
      <div className="space-y-3 p-6">
        <p className="text-sm text-danger">{error}</p>
        <Button variant="outline" onClick={() => void refetch()}>
          Reintentar
        </Button>
      </div>
    ) : (
      <div className="space-y-2 p-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (data.modules.length === 0) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Esta especialización todavía no tiene módulos. Agregalos desde la pestaña Recorrido.
      </p>
    );
  }

  const faltan = data.modules.filter((m) => m.projected).length;

  return (
    <div className="space-y-6 p-6">
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {material.error ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-sm">
          <span>{material.error}</span>
          <Button size="sm" variant="outline" onClick={() => void material.reintentar()}>
            Reintentar
          </Button>
        </div>
      ) : null}

      {canEdit && faltan > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning-border bg-warning-soft p-3 text-sm">
          <p>
            {faltan} módulo{faltan === 1 ? "" : "s"} sin cronograma. Se generan todos juntos; los
            que ya tienen clases no se tocan.
          </p>
          <Button size="sm" loading={generando} onClick={() => void generarTodos()}>
            {!generando && <CalendarDays className="h-4 w-4" aria-hidden />}
            {generando ? "Generando…" : "Generar cronograma de todos los módulos"}
          </Button>
        </div>
      ) : null}

      {resumen ? (
        <div className="rounded-md border p-3 text-sm" role="status">
          <p className="font-medium">
            {resumen.generated.length > 0
              ? `Se generaron ${resumen.generated.reduce((n, g) => n + g.classes, 0)} clases en ${resumen.generated.length} módulo${resumen.generated.length === 1 ? "" : "s"}.`
              : "No se generó ninguna clase."}
          </p>
          {resumen.skipped.length > 0 ? (
            <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
              {resumen.skipped.map((s) => (
                <li key={s.cohortId}>
                  {s.label}: {s.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {data.modules.map((m) => (
        <section key={m.cohortId} aria-labelledby={`mod-${m.cohortId}`} className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={`mod-${m.cohortId}`} className="text-sm font-semibold text-foreground">
              <Link href={`/cohorts/${m.cohortId}`} className="hover:underline">
                {m.label}
              </Link>
            </h3>
            {m.projected ? (
              <Badge variant="warning">Proyección</Badge>
            ) : (
              <Badge variant="secondary">{m.classes.length} clases</Badge>
            )}
          </div>
          {m.projected && m.cannotGenerateReason ? (
            <p className="text-xs text-muted-foreground">{m.cannotGenerateReason}</p>
          ) : null}
          {m.classes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin clases ni días de cursada declarados.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {m.classes.map((c) => (
                <li
                  key={c.id ?? `proj-${m.cohortId}-${c.number}`}
                  className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm"
                >
                  <span className="w-8 shrink-0 text-muted-foreground">{c.number}</span>
                  <span className="w-32 shrink-0 font-medium">{fecha(c.date)}</span>
                  <span className="w-28 shrink-0 text-muted-foreground">
                    {c.startTime && c.endTime ? `${c.startTime}–${c.endTime}` : "sin horario"}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{c.topic ?? ""}</span>
                  {c.canceled ? <Badge variant="outline">Cancelada</Badge> : null}
                  {!c.projected && c.id && material.porClase ? (
                    <span className="order-last w-full">
                      <ResourcesPanel
                        classSessionId={c.id}
                        canEdit={canEdit}
                        initialItems={material.porClase[c.id] ?? []}
                      />
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <p className="text-xs text-muted-foreground">
        Los horarios son de {data.timezone.replaceAll("_", " ")}. Enlaces, aulas y asistencia se
        cargan desde cada módulo.
      </p>
    </div>
  );
}
