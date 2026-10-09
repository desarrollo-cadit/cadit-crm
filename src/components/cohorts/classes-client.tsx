"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, DoorOpen, Video, Link2 } from "lucide-react";
import { ResourcesPanel, useClassMaterial } from "@/components/academic/resources-panel";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { notify } from "@/lib/notify";

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
  /**
   * 023 US5 — Aula propia de ESTA clase. `null` = hereda la de la cohorte.
   * Es el recurso OCUPADO, nunca de dónde sale el enlace (025, FR-004).
   */
  virtualRoomId: string | null;
  /** 030 — De dónde salió la grabación: adjudicada desde Zoom o pegada a mano. */
  recordingSource?: "manual" | "zoom" | null;
};

/**
 * Lo mínimo de un aula para poder elegirla y nombrarla. Su URL NO viaja acá a
 * propósito: el aula no es una fuente de enlace (025, FR-004).
 */
type Aula = { id: string; name: string; archivedAt: string | null };

type Payload = {
  cohortId: string;
  projected: boolean;
  cannotGenerateReason: string | null;
  timezone: string;
  /** 023 US5 — El aula que la cohorte presta, para decir de QUÉ se hereda. */
  cohortVirtualRoomId: string | null;
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
  /** Solo el error de CARGA de las clases (estado). Las escrituras avisan con toast. */
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  /** Qué se está editando: la clase y CUÁL de sus dos enlaces. */
  const [editing, setEditing] = useState<
    { classId: string; campo: "meetingUrl" | "recordingUrl" } | null
  >(null);
  const [draft, setDraft] = useState("");
  /** 023 US5 — Las aulas ACTIVAS: las únicas que se pueden elegir. */
  const [aulas, setAulas] = useState<Aula[] | null>(null);
  const [aulasError, setAulasError] = useState<string | null>(null);
  const [guardandoAula, setGuardandoAula] = useState<string | null>(null);
  /**
   * 029 — El material de TODAS las filas en un solo pedido. Antes cada fila
   * montaba su panel y pedía lo suyo: 100 clases, 100 requests.
   */
  const material = useClassMaterial(cohortId);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/cohorts/${cohortId}/classes`).catch(() => null);
    if (!res?.ok) {
      setError("No se pudieron cargar las clases");
      setLoading(false);
      return;
    }
    setData((await res.json()) as Payload);
    /*
      Una recarga que funcionó desmiente el error de la recarga anterior, así
      que se limpia acá.

      Y por eso mismo NO se recarga después de una escritura fallida: el
      `refetch` llegaba unos milisegundos más tarde, encontraba la lista bien
      y borraba el mensaje del guardado que acababa de fallar. La persona
      pegaba "zoom.us/j/123" sin esquema, el servidor lo rechazaba con un 422
      que explicaba exactamente eso, y en pantalla no quedaba nada: ni el
      enlace guardado ni el motivo. Una escritura que falló no cambió nada
      del servidor, así que tampoco hay nada que recargar.
    */
    setError(null);
    setLoading(false);
  }, [cohortId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function generar() {
    setGenerating(true);
    const res = await fetch(`/api/cohorts/${cohortId}/schedule`, {
      method: "POST",
    }).catch(() => null);
    setGenerating(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      notify.error(body?.error?.message ?? "No se pudo generar el cronograma");
      return;
    }
    notify.success("Cronograma generado.");
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
      notify.error(body?.error?.message ?? "No se pudo guardar el enlace");
      // Se deja el editor ABIERTO y con lo tipeado: el mensaje dice qué
      // corregir, y cerrarlo obligaría a escribir todo de nuevo.
      return;
    }
    notify.success("Enlace guardado.");
    setEditing(null);
    setDraft("");
    void refetch();
  }

  /**
   * 023 US5 (FR-009) — Se traen TODAS, y el selector ofrece sólo las activas.
   *
   * Son dos cosas distintas, y por eso no alcanza con el filtro del servidor:
   * un aula dada de baja no se puede OFRECER —el servidor rechaza asignarla
   * (`roomAssignmentError`), así que ofrecerla sería tender una trampa—, pero
   * la clase que ya la tenía asignada tiene que poder NOMBRARLA, o su fila
   * queda en blanco y se borra dónde se dictó.
   */
  const cargarAulas = useCallback(async () => {
    const res = await fetch("/api/virtual-rooms?includeArchived=1").catch(() => null);
    if (!res?.ok) {
      /*
        "No pude traerlas" no es "no hay ninguna". Cayendo a una lista vacía,
        el selector afirmaría que la academia no tiene aulas cargadas y quien
        mire va a ir a crear una que ya existe.
      */
      setAulasError("No se pudieron cargar las aulas.");
      return;
    }
    setAulas(((await res.json()) as { rooms: Aula[] }).rooms);
    setAulasError(null);
  }, []);

  useEffect(() => {
    if (!canEditLinks) return;
    void cargarAulas();
  }, [canEditLinks, cargarAulas]);

  /**
   * 023 US5 (FR-003) — Mueve UNA clase de aula, o la devuelve a la herencia.
   *
   * `null` no es "el campo quedó vacío": es la opción explícita de volver a
   * heredar el aula de la cohorte, y por eso está escrita con todas las letras
   * en el selector en vez de lograrse borrando algo.
   */
  async function guardarAula(classId: string, virtualRoomId: string | null) {
    setGuardandoAula(classId);
    const res = await fetch(`/api/class-sessions/${classId}/room`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ virtualRoomId }),
    }).catch(() => null);
    setGuardandoAula(null);

    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      // El servidor dice QUÉ pasó —un aula de baja, una clase que no existe—;
      // un "no se pudo" genérico borraría el motivo.
      notify.error(body?.error?.message ?? "No se pudo cambiar el aula de la clase");
      return;
    }
    notify.success("Se cambió el aula de esta clase.");
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

  /** FR-009 — Éstas se OFRECEN; las de baja sólo se nombran. */
  const aulasActivas = aulas?.filter((a) => a.archivedAt === null) ?? [];
  const nombreDeAula = (id: string | null) =>
    id ? (aulas?.find((a) => a.id === id)?.name ?? null) : null;
  const aulaDeLaCohorte = nombreDeAula(data.cohortVirtualRoomId);

  return (
    <div className="space-y-4 p-6">
      {error && (
        <p className="rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {/* Las aulas que no se pudieron traer se dicen, con un reintento: el
          selector de abajo muestra el aula que cada clase tiene igual. */}
      {aulasError && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-sm">
          <span>{aulasError}</span>
          <Button size="sm" variant="outline" onClick={() => void cargarAulas()}>
            Reintentar
          </Button>
        </div>
      )}

      {material.error && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-sm">
          <span>{material.error}</span>
          <Button size="sm" variant="outline" onClick={() => void material.reintentar()}>
            Reintentar
          </Button>
        </div>
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
            {!c.projected && c.id && material.porClase && (
              <span className="w-full order-last">
                <ResourcesPanel
                  classSessionId={c.id}
                  canEdit={canEdit}
                  initialItems={material.porClase[c.id] ?? []}
                />
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
            ) : null}
            {/* 030 — De dónde salió la grabación: la trajo Zoom o la pegó alguien. */}
            {!c.canceled && !c.meetingUrl && c.recordingUrl && c.recordingSource ? (
              <Badge variant={c.recordingSource === "zoom" ? "success" : "secondary"}>
                {c.recordingSource === "zoom" ? "Zoom" : "manual"}
              </Badge>
            ) : null}
            {!c.canceled && !c.meetingUrl && !c.recordingUrl && !c.projected && c.endsAt &&
            new Date(c.endsAt) < new Date() ? (
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
                  {editing.campo === "recordingUrl" && c.recordingSource === "zoom" && (
                    <span className="text-xs text-warning">
                      Vas a reemplazar la grabación de Zoom: queda sin clase y la sincronización no la vuelve a poner.
                    </span>
                  )}
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

            {/*
              023 US5 (FR-003) — El aula de ESTA clase: qué sala queda OCUPADA.

              Va deliberadamente lejos del enlace y sin nombrarlo. La cadena que
              ve el alumno es `clase ?? cohorte` y el aula NO participa (025,
              FR-004): su sala es la de la cuenta y la comparten todas las
              cohortes que la usan, así que cambiar esto no mueve a nadie de
              reunión.
            */}
            {canEditLinks && !c.projected && !c.canceled && c.id && (
              <span className="flex items-center gap-1.5">
                <DoorOpen className="h-4 w-4 text-muted-foreground" aria-hidden />
                {aulas === null ? (
                  /* Sin la lista no se dibuja un selector vacío: se dice si la
                     clase tiene aula propia o hereda, que es lo único cierto
                     mientras no se la pueda nombrar. */
                  <span className="text-xs text-muted-foreground">
                    {c.virtualRoomId ? "Aula propia" : "Hereda de la cohorte"}
                  </span>
                ) : (
                  <Select
                    aria-label={`Aula de la clase ${c.number}`}
                    className="h-8 w-56 text-xs"
                    value={c.virtualRoomId ?? ""}
                    disabled={guardandoAula === c.id}
                    onChange={(e) =>
                      void guardarAula(
                        c.id!,
                        e.target.value === "" ? null : e.target.value
                      )
                    }
                  >
                    <option value="">
                      {aulaDeLaCohorte
                        ? `Hereda de la cohorte (${aulaDeLaCohorte})`
                        : "Hereda de la cohorte (sin aula)"}
                    </option>
                    {aulasActivas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                    {/*
                      FR-009 — Un aula de baja no se OFRECE, pero la clase que
                      ya la tenía asignada tiene que seguir nombrándola:
                      dejarla en blanco borraría dónde se dictó.
                    */}
                    {c.virtualRoomId &&
                      !aulasActivas.some((a) => a.id === c.virtualRoomId) && (
                        <option value={c.virtualRoomId}>
                          {nombreDeAula(c.virtualRoomId) ?? "Aula"} (de baja)
                        </option>
                      )}
                  </Select>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        Los horarios son de {data.timezone.replaceAll("_", " ")}.
      </p>
    </div>
  );
}
