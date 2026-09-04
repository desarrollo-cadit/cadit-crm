"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Video, Link2 } from "lucide-react";
import { ResourcesPanel } from "@/components/academic/resources-panel";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type ClassRow = {
  id: string | null;
  number: number;
  projected: boolean;
  date: string;
  startTime: string | null;
  endTime: string | null;
  startsAt: string | null;
  endsAt: string | null;
  topic: string | null;
  canceled: boolean;
  cancelReason: string | null;
  meetingUrl: string | null;
  /**
   * 025 — Enlace propio de ESTA clase, crudo y sin recortar por la ventana.
   * `null` = está heredando el de la cohorte. Es lo que se edita; `meetingUrl`
   * es lo que se usa para entrar.
   */
  ownMeetingUrl: string | null;
  recordingUrl: string | null;
};

type Payload = {
  cohortId: string;
  projected: boolean;
  cannotGenerateReason: string | null;
  timezone: string;
  classes: ClassRow[];
};

/**
 * 013 (T013, FR-005c) — UNA lista de clases, no dos pantallas.
 *
 * El alumno no piensa en "clases" y "grabaciones" como cosas distintas:
 * piensa en la clase del martes y quiere entrar, o verla si ya pasó. Por eso
 * cada fila cambia según el momento en vez de haber una pantalla de cronograma
 * y otra de grabaciones.
 *
 * Se construye para el panel del staff primero. Cuando lleguen los portales
 * (014/015) exponen algo que ya funciona y ya tiene datos.
 */
export function ClassesClient({
  cohortId,
  canEdit,
  canEditLinks,
}: {
  cohortId: string;
  /** `academico.editar` — generar el cronograma. */
  canEdit: boolean;
  /** `asistencia.editar` — cargar enlaces y grabaciones (DV-001c). */
  canEditLinks: boolean;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  /** Qué se está editando: la clase y CUÁL de sus dos enlaces. */
  const [editing, setEditing] = useState<
    { classId: string; campo: "meetingUrl" | "recordingUrl" } | null
  >(null);
  const [draft, setDraft] = useState("");

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/cohorts/${cohortId}/classes`).catch(() => null);
    if (!res?.ok) {
      setError("No se pudieron cargar las clases");
      setLoading(false);
      return;
    }
    setData((await res.json()) as Payload);
    setLoading(false);
  }, [cohortId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function generar() {
    setGenerating(true);
    setError(null);
    const res = await fetch(`/api/cohorts/${cohortId}/schedule`, {
      method: "POST",
    }).catch(() => null);
    setGenerating(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(body?.error?.message ?? "No se pudo generar el cronograma");
    }
    void refetch();
  }

  /**
   * 013 (DV-001c) / 025 — Un solo guardado para los dos enlaces.
   *
   * Vaciar el campo manda `null`, y eso NO es lo mismo que dejarlo igual: en
   * el enlace de la clase, `null` la devuelve a heredar el de la cohorte, que
   * es justo lo que quiere quien deshace una excepción.
   */
  async function guardarEnlace(
    classId: string,
    campo: "meetingUrl" | "recordingUrl"
  ) {
    const url = draft.trim();
    const res = await fetch(`/api/class-sessions/${classId}/links`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [campo]: url === "" ? null : url }),
    }).catch(() => null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(body?.error?.message ?? "No se pudo guardar el enlace");
    } else {
      setError(null);
      setEditing(null);
      setDraft("");
    }
    void refetch();
  }

  if (loading) {
    return (
      <div className="space-y-2 p-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!data) {
    return <p className="p-6 text-sm text-muted-foreground">{error ?? "Sin datos"}</p>;
  }

  const fecha = (iso: string) =>
    new Date(iso).toLocaleDateString("es-UY", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });

  return (
    <div className="space-y-4 p-6">
      {error && (
        <p className="rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {/* 013 (T014) — La proyección se distingue a simple vista, no en un
          tooltip: si no se nota, el equipo cree que son clases reales y se
          pregunta por qué no puede cancelar ninguna. */}
      {data.projected && (
        <div className="rounded-md border border-warning-border bg-warning-soft p-3 text-sm">
          <p className="font-medium">Estas clases son una proyección</p>
          <p className="mt-1 text-muted-foreground">
            Se dibujan a partir de los días de cursada declarados. Todavía no
            existen como clases: no se pueden cancelar, no llevan enlace de
            reunión ni grabación, y no registran asistencia.
          </p>
          {data.cannotGenerateReason ? (
            /* Criterio T017d de 012: el motivo, no un botón que va a fallar. */
            <p className="mt-2 text-muted-foreground">
              {data.cannotGenerateReason}
            </p>
          ) : canEdit ? (
            <Button
              size="sm"
              className="mt-2"
              loading={generating}
              onClick={() => void generar()}
            >
              {!generating && <CalendarDays className="h-4 w-4" />}
              {generating ? "Generando…" : "Generar cronograma"}
            </Button>
          ) : null}
        </div>
      )}

      {data.classes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Esta cohorte todavía no tiene clases ni días de cursada declarados.
        </p>
      )}

      <ul className="divide-y rounded-md border">
        {data.classes.map((c) => (
          <li
            key={c.id ?? `proj-${c.number}`}
            className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
          >
            <span className="w-8 shrink-0 text-muted-foreground">{c.number}</span>
            <span className="w-32 shrink-0 font-medium">{fecha(c.date)}</span>
            <span className="w-28 shrink-0 text-muted-foreground">
              {c.startTime && c.endTime
                ? `${c.startTime}–${c.endTime}`
                : "sin horario"}
            </span>
            <span className="min-w-0 flex-1 truncate">{c.topic ?? ""}</span>

            {/* 013 (T023) — El material de ESTA clase, donde se lo busca.
                Una proyección no puede tener material: todavía no existe como
                clase a la cual colgarle nada. */}
            {!c.projected && c.id && (
              <span className="w-full order-last">
                <ResourcesPanel classSessionId={c.id} canEdit={canEdit} />
              </span>
            )}

            {/* Cada fila ofrece lo que corresponde a SU momento (FR-005c). */}
            {c.canceled ? (
              <span className="text-muted-foreground">
                <Badge variant="outline">Cancelada</Badge>
                {c.cancelReason && <span className="ml-2">{c.cancelReason}</span>}
              </span>
            ) : c.meetingUrl ? (
              /* Un <a> con el estilo del botón: `Button` renderiza un
                 <button>, y meter un enlace adentro sería HTML inválido. */
              <a
                href={c.meetingUrl}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ size: "sm" })}
              >
                <Video className="h-4 w-4" />
                Entrar a la clase
              </a>
            ) : c.recordingUrl ? (
              <a
                href={c.recordingUrl}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Video className="h-4 w-4" />
                Ver grabación
              </a>
            ) : !c.projected && c.endsAt && new Date(c.endsAt) < new Date() ? (
              <span className="text-muted-foreground">Grabación pendiente</span>
            ) : null}

            {/* DV-001c / 025 — cargar enlaces: profesor o coordinación. */}
            {canEditLinks && !c.projected && !c.canceled && c.id && (
              editing?.classId === c.id ? (
                <span className="flex items-center gap-1">
                  <Input
                    autoFocus
                    value={draft}
                    placeholder={
                      editing.campo === "meetingUrl"
                        ? "https://zoom.us/j/… (vacío = usar el de la cohorte)"
                        : "https://…"
                    }
                    className="h-8 w-72"
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <Button
                    size="sm"
                    onClick={() => void guardarEnlace(c.id!, editing.campo)}
                  >
                    Guardar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancelar
                  </Button>
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  {/*
                    025 — Se dice si la clase HEREDA o tiene enlace propio, y no
                    solo "cargar/cambiar". Quien mira la lista necesita saber en
                    cuál de las dos está parado: borrar un enlace propio la
                    devuelve a la reunión de la cohorte, y eso es una decisión,
                    no un descuido.
                  */}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing({ classId: c.id!, campo: "meetingUrl" });
                      setDraft(c.ownMeetingUrl ?? "");
                    }}
                  >
                    <Video className="h-4 w-4" />
                    {c.ownMeetingUrl ? "Enlace propio" : "Hereda el enlace"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing({ classId: c.id!, campo: "recordingUrl" });
                      setDraft(c.recordingUrl ?? "");
                    }}
                  >
                    <Link2 className="h-4 w-4" />
                    {c.recordingUrl ? "Cambiar grabación" : "Cargar grabación"}
                  </Button>
                </span>
              )
            )}
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        Los horarios son de {data.timezone.replace("_", " ")}.
      </p>
    </div>
  );
}
