"use client";

import { useCallback, useEffect, useState } from "react";
import { ChipDeEstado } from "@/components/portal/campus";
import { ClipboardCheck, Clock, ExternalLink, MessageSquare, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyNote, PortalCard, formatDate } from "@/components/portal/student-bits";
import { notify } from "@/lib/notify";

/**
 * 016 (US1, US4, US5) — Entregar, ver la devolución y reentregar.
 *
 * Vive en la pestaña de Evaluaciones de la cursada porque es ahí donde el
 * alumno ya va a mirar cómo le fue: separar "mis notas" de "mis entregas" en
 * dos lugares obliga a recordar en cuál estaba lo que busca.
 *
 * Lo que la pantalla tiene que dejar claro, en este orden: **hasta cuándo**,
 * **qué entregué** y **qué me dijeron**. El resto es ruido.
 */

type Estado = "sin_entrega" | "entregada" | "tardia" | "corregida";

type Entrega = {
  id: string;
  url: string;
  title: string | null;
  submittedAt: string;
  passed: boolean | null;
  feedback: string | null;
  correctedAt: string | null;
  correctedByName: string | null;
  reopenedAt: string | null;
  tardia: boolean;
};

type EvaluacionConEntregas = {
  assessmentId: string;
  assessmentName: string;
  required: boolean;
  dueAt: string | null;
  prorroga: { dueAt: string; reason: string; grantedByName: string | null } | null;
  vigenteAt: string | null;
  estado: Estado;
  puedeEntregar: boolean;
  entregas: Entrega[];
};

/**
 * 031 (DV-010) — Una corrección PUBLICADA, como la manda
 * `/api/portal/me/correcciones`. Sin estado ni circuito de aprobación: lo que
 * no está publicado no llega, así que no hay nada que esconder acá.
 */
export type CorreccionPublicada = {
  assessmentId: string;
  scale: "pass_fail" | "numeric";
  minScore: number | null;
  criteria: { id: string; name: string; maxPoints: number }[];
  textFields: { id: string; name: string; required: boolean }[];
  correction: {
    id: string;
    submissionId: string | null;
    score: number | null;
    passed: boolean | null;
    feedback: string | null;
    criterionScores: { criterionId: string; points: number | null; comment: string | null }[];
    textValues: { fieldId: string; value: string }[];
    correctedByName: string | null;
    publishedAt: string | null;
  };
};

type AssessmentResumen = {
  id: string;
  name: string;
  required: boolean;
  passed: boolean | null;
};

/**
 * FR-005e — El plazo, en la zona de la ACADEMIA, con día y hora porque cierra
 * a una hora concreta.
 *
 * No en la de quien mira: la fecha límite es una sola para toda la cohorte, y
 * los 87 alumnos que cursan desde otro país tienen que leer la MISMA hora que
 * el profesor escribió. Pintada con el reloj del navegador, el que está en
 * Madrid ve las 04:59 del día siguiente y cree que llega tarde.
 */
function fechaYHora(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("es-UY", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

const ESTADO: Record<Estado, { label: string; tone: "curso" | "atencion" | "neutro" }> = {
  sin_entrega: { label: "Sin entregar", tone: "neutro" },
  entregada: { label: "Entregada", tone: "curso" },
  /** SC-003 — fuera de plazo se distingue a simple vista. No rechaza: avisa. */
  tardia: { label: "Entregada fuera de plazo", tone: "atencion" },
  corregida: { label: "Corregida", tone: "curso" },
};

export function StudentSubmissions({
  enrollmentId,
  assessments,
  academyZone,
}: {
  enrollmentId: string;
  /** Lo que ya trae la cursada: el resultado oficial de cada evaluación (010). */
  assessments: AssessmentResumen[];
  /** FR-005e — la zona de la academia, que ya viaja con la cursada. */
  academyZone: string;
}) {
  const [datos, setDatos] = useState<EvaluacionConEntregas[] | null>(null);
  const [correcciones, setCorrecciones] = useState<CorreccionPublicada[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const cursada = encodeURIComponent(enrollmentId);
    const [res, resCorrecciones] = await Promise.all([
      fetch(`/api/portal/me/entregas?cursada=${cursada}`).catch(() => null),
      fetch(`/api/portal/me/correcciones?cursada=${cursada}`).catch(() => null),
    ]);
    /*
      **"No entregaste" y "no pudimos traer tus entregas" son dos frases
      distintas**, y la segunda dicha como la primera es una acusación: con la
      lista vacía el alumno lee "Sin entregar" sobre un trabajo que sí entregó,
      sin formulario y sin una palabra de por qué. Es el default optimista que
      el ciclo 013 ya pagó caro en el legajo, esta vez sobre la evidencia de
      que cumplió.
    */
    /*
      031 — Lo mismo vale para las correcciones: sin ellas, la pantalla diría
      "Pendiente de corrección" sobre un trabajo que ya está corregido.
    */
    if (!res?.ok || !resCorrecciones?.ok) {
      setError("No pudimos cargar tus entregas. Suele ser algo momentáneo: en unos minutos deberían aparecer.");
      return;
    }
    const body = (await res.json()) as { assessments: EvaluacionConEntregas[] };
    const publicadas = (await resCorrecciones.json()) as { assessments: CorreccionPublicada[] };
    setError(null);
    setDatos(body.assessments);
    setCorrecciones(publicadas.assessments);
  }, [enrollmentId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (assessments.length === 0) {
    return (
      <EmptyNote title="Este curso aún no tiene evaluaciones">
        Cuando la academia las publique, aquí verás su estado de corrección y
        dónde realizar cada entrega.
      </EmptyNote>
    );
  }

  if (error && !datos) {
    return (
      <PortalCard className="space-y-3 border-danger-border bg-danger-soft">
        <p className="text-sm text-danger">{error}</p>
        <Button variant="outline" onClick={() => void refetch()}>
          Reintentar
        </Button>
      </PortalCard>
    );
  }

  if (!datos) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-3">
      {/* Falló al refrescar: lo de abajo es real, pero puede estar viejo. */}
      {error && (
        <p className="rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-sm text-danger">
          {error} Lo que ves puede no estar actualizado.
        </p>
      )}
      <ul className="space-y-3">
        {assessments.map((a) => (
          <EvaluacionItem
            key={a.id}
            resumen={a}
            entregas={datos.find((d) => d.assessmentId === a.id) ?? null}
            correccion={correcciones.find((c) => c.assessmentId === a.id) ?? null}
            zona={academyZone}
            onCambio={refetch}
          />
        ))}
      </ul>
    </div>
  );
}

function EvaluacionItem({
  resumen,
  entregas,
  correccion,
  zona,
  onCambio,
}: {
  resumen: AssessmentResumen;
  entregas: EvaluacionConEntregas | null;
  /** 031 — La corrección publicada, si la hay. */
  correccion: CorreccionPublicada | null;
  zona: string;
  onCambio: () => void;
}) {
  const estado = entregas?.estado ?? "sin_entrega";
  const ultima = entregas?.entregas[0] ?? null;
  const anteriores = entregas?.entregas.slice(1) ?? [];

  return (
    <li className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{resumen.name}</p>
          {!resumen.required && (
            <p className="text-xs text-text-3">No obligatoria</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <ChipDeEstado tono={ESTADO[estado].tone}>
            {ESTADO[estado].label}
          </ChipDeEstado>
          {/*
            FR-005 de 010 — sin corregir se muestra PENDIENTE, jamás
            desaprobada. El resultado sale de la evaluación, no de la entrega:
            la academia puede corregir por fuera del sistema.
          */}
          {resumen.passed === null ? null : resumen.passed ? (
            <ChipDeEstado tono="ok">
              Aprobada
            </ChipDeEstado>
          ) : (
            <ChipDeEstado tono="atencion">
              No aprobada
            </ChipDeEstado>
          )}
        </div>
      </div>

      <Plazo evaluacion={entregas} zona={zona} />

      {/* 0083 — Pedir más tiempo: lo decide Coordinación. */}
      <SolicitudDeProrroga assessmentId={resumen.id} zona={zona} onDecidido={onCambio} />

      {/*
        031 (US3) — La corrección completa, dentro de la evaluación. Con una
        publicada, la devolución se lee acá y no se repite en la entrega. Sin
        ninguna —y sin un resultado cargado por el camino de antes de 031—
        es "Pendiente de corrección", jamás un desaprobado.
      */}
      {(correccion || resumen.passed === null) && (
        <CorreccionDelAlumno correccion={correccion} />
      )}

      {ultima && <EntregaHecha entrega={ultima} zona={zona} conDevolucion={!correccion} />}

      {anteriores.length > 0 && (
        /*
          FR-008 — Una reentrega NO borra la anterior. El historial va plegado:
          lo que importa es la última, pero lo anterior tiene que poder mirarse
          —es la evidencia de qué se corrigió y por qué se pidió de nuevo—.
          `<details>` y no un estado: sin JavaScript y sin una dependencia más.
        */
        <details className="rounded-md border border-border">
          <summary className="cursor-pointer px-3 py-2 text-xs text-text-3">
            Ver las {anteriores.length}{" "}
            {anteriores.length === 1 ? "entrega anterior" : "entregas anteriores"}
          </summary>
          <div className="space-y-2 border-t border-border p-3">
            {anteriores.map((e) => (
              <EntregaHecha key={e.id} entrega={e} zona={zona} conDevolucion={!correccion} />
            ))}
          </div>
        </details>
      )}

      {entregas?.puedeEntregar ? (
        <FormularioDeEntrega
          assessmentId={resumen.id}
          reentrega={ultima !== null}
          onListo={onCambio}
        />
      ) : (
        ultima && (
          /*
            FR-010/FR-013 — El permiso es un ESTADO de la entrega. Se dice por
            qué no se puede y qué destraba: un botón deshabilitado sin
            explicación manda a la persona a preguntar por WhatsApp, que es
            exactamente lo que esta fase vino a evitar.
          */
          <p className="text-xs text-text-3">
            Entrega recibida. Si necesitás cambiarla, tu profesor puede
            reabrirla.
          </p>
        )
      )}
    </li>
  );
}

/**
 * FR-005/FR-005b/FR-005c — Hasta cuándo, de verdad.
 *
 * Lo que se muestra es la fecha VIGENTE —la más tardía entre la del grupo y la
 * prórroga—, porque es la única contra la que se mide. Mostrar la del grupo a
 * quien tiene prórroga lo haría entregar antes de lo que necesita, y mostrar
 * sólo la prórroga escondería que el grupo entero recibió más plazo.
 */
function Plazo({
  evaluacion,
  zona,
}: {
  evaluacion: EvaluacionConEntregas | null;
  zona: string;
}) {
  if (!evaluacion?.vigenteAt) {
    // DV-001 — Sin plazo no hay "tardía" que marcar, y decirlo evita la
    // pregunta. No todas las evaluaciones tienen fecha.
    return <p className="text-xs text-text-3">Sin fecha límite</p>;
  }

  return (
    <div className="space-y-1">
      <p className="inline-flex items-center gap-1.5 text-xs text-text-2">
        <Clock className="h-3.5 w-3.5 text-text-3" strokeWidth={1.8} />
        Plazo de entrega: {fechaYHora(evaluacion.vigenteAt, zona)}
      </p>
      {evaluacion.prorroga && (
        <p className="text-xs text-text-3">
          Prórroga otorgada
          {evaluacion.prorroga.grantedByName &&
            ` por ${evaluacion.prorroga.grantedByName}`}
          : {evaluacion.prorroga.reason}
        </p>
      )}
    </div>
  );
}

function EntregaHecha({
  entrega,
  zona,
  conDevolucion = true,
}: {
  entrega: Entrega;
  zona: string;
  /** 031 — Con corrección publicada, la devolución ya se lee completa arriba. */
  conDevolucion?: boolean;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-subtle p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <a
          href={entrega.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[32px] items-center gap-1.5 text-sm font-medium underline"
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
          {entrega.title ?? "Mi entrega"}
        </a>
        <span className="text-xs text-text-3">
          {fechaYHora(entrega.submittedAt, zona)}
        </span>
        {entrega.tardia && (
          <ChipDeEstado tono="atencion">
            Fuera de plazo
          </ChipDeEstado>
        )}
      </div>

      {/*
        FR-007 — La devolución escrita, que es la mitad que hoy se pierde en
        otro canal. Vive en la ENTREGA y no en la nota interna del staff
        (FR-011): son dos textos con dos audiencias distintas.
      */}
      {conDevolucion && entrega.feedback && (
        <div className="flex items-start gap-2 border-t border-border pt-2">
          <MessageSquare
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-3"
            strokeWidth={1.8}
          />
          <div className="min-w-0">
            <p className="whitespace-pre-line text-sm text-text-2">
              {entrega.feedback}
            </p>
            <p className="mt-1 text-xs text-text-3">
              {entrega.correctedByName ?? "Tu profesor"}
              {entrega.correctedAt && ` · ${formatDate(entrega.correctedAt)}`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 031 (T030, US3) — La corrección PUBLICADA, completa: nota, cada ejercicio con
 * su puntaje sobre el máximo y su comentario, los campos de texto, la
 * devolución, quién corrigió y cuándo. Es lo que el dueño pidió que el alumno
 * vea "sin pedirlo".
 *
 * Sin corrección publicada dice "Pendiente de corrección": un borrador o una
 * corrección esperando aprobación no llegan hasta acá (DV-010), y su ausencia
 * nunca se lee como un desaprobado.
 */
export function CorreccionDelAlumno({
  correccion,
}: {
  correccion: CorreccionPublicada | null;
}) {
  if (!correccion) {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-text-3">
        <ClipboardCheck className="h-3.5 w-3.5" strokeWidth={1.8} />
        Pendiente de corrección
      </p>
    );
  }

  const c = correccion.correction;
  return (
    <div className="space-y-3 rounded-md border border-border bg-subtle p-3">
      <div className="flex flex-wrap items-center gap-2">
        {c.score !== null && <span className="text-lg font-semibold">{c.score}/100</span>}
        {c.passed !== null && (
          <ChipDeEstado tono={c.passed ? "ok" : "atencion"}>
            {c.passed ? "Aprobada" : "No aprobada"}
          </ChipDeEstado>
        )}
        {correccion.minScore !== null && (
          <span className="text-xs text-text-3">Se aprueba con {correccion.minScore}</span>
        )}
      </div>

      {correccion.criteria.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border bg-card">
          {correccion.criteria.map((criterio) => {
            const p = c.criterionScores.find((s) => s.criterionId === criterio.id);
            return (
              <li key={criterio.id} className="space-y-0.5 px-3 py-2">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span>{criterio.name}</span>
                  <span className="shrink-0 font-medium">
                    {p?.points ?? "—"} de {criterio.maxPoints}
                  </span>
                </div>
                {p?.comment && (
                  <p className="whitespace-pre-line text-xs text-text-2">{p.comment}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {correccion.textFields.map((campo) => {
        const valor = c.textValues.find((v) => v.fieldId === campo.id)?.value;
        if (!valor) return null;
        return (
          <div key={campo.id}>
            <p className="text-xs font-medium text-text-2">{campo.name}</p>
            <p className="whitespace-pre-line text-sm text-text-2">{valor}</p>
          </div>
        );
      })}

      {c.feedback && (
        <div className="flex items-start gap-2">
          <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-3" strokeWidth={1.8} />
          <p className="whitespace-pre-line text-sm text-text-2">{c.feedback}</p>
        </div>
      )}

      <p className="text-xs text-text-3">
        Corrigió {c.correctedByName ?? "tu profesor"}
        {c.publishedAt && ` · ${formatDate(c.publishedAt)}`}
      </p>
    </div>
  );
}

/**
 * FR-002/FR-003 — Se entrega un ENLACE, y la pantalla lo dice con esas
 * palabras.
 *
 * El sistema no guarda archivos (decisión marco de la fase): quien espere un
 * botón de "subir" tiene que entender en la primera lectura que pega un enlace
 * de Drive o WeTransfer, o va a abandonar creyendo que la pantalla está rota.
 */
function FormularioDeEntrega({
  assessmentId,
  reentrega,
  onListo,
}: {
  assessmentId: string;
  reentrega: boolean;
  onListo: () => void;
}) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function entregar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);

    const res = await fetch("/api/portal/me/entregas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        assessmentId,
        url: url.trim(),
        title: title.trim() || null,
      }),
    }).catch(() => null);
    setGuardando(false);

    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      notify.error(body?.error?.message ?? "No pudimos registrar la entrega. ¿El enlace está completo? Podés corregirlo y enviarla otra vez.");
      return;
    }

    notify.success("Entrega registrada.");
    setUrl("");
    setTitle("");
    onListo();
  }

  return (
    <form onSubmit={entregar} className="space-y-3 border-t border-border pt-3">
      <div className="space-y-1.5">
        <Label htmlFor={`url-${assessmentId}`}>
          {reentrega ? "Enlace de tu nueva entrega" : "Enlace de tu entrega"}
        </Label>
        <Input
          id={`url-${assessmentId}`}
          type="url"
          required
          className="h-11"
          placeholder="https://drive.google.com/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <p className="text-xs text-text-3">
          El enlace a tu archivo en Drive, WeTransfer o Autodesk Docs. Guardamos
          solo el enlace, así que el archivo tiene que estar compartido para
          que tu profesor pueda abrirlo.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`titulo-${assessmentId}`}>Título (opcional)</Label>
        <Input
          id={`titulo-${assessmentId}`}
          className="h-11"
          placeholder="Entrega final — planta baja"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <Button type="submit" className="h-11 w-full" loading={guardando}>
        <Upload className="h-4 w-4" />
        {reentrega ? "Volver a entregar" : "Entregar"}
      </Button>
    </form>
  );
}

/* ============================================================
 * 0083 — El pedido de prórroga
 * ============================================================ */

type EstadoDePedido = {
  vigenteAt: string | null;
  pedido: {
    id: string;
    requestedDueAt: string;
    reason: string;
    status: "pendiente" | "aprobada" | "rechazada";
    decisionNote: string | null;
    decidedAt: string | null;
  } | null;
  puedePedir: boolean;
};

/**
 * "Solicitar prórroga": un día y el motivo. El pedido NO corre el plazo: lo
 * aprueba o rechaza Coordinación, y hasta entonces se ve como pendiente. Si
 * el acceso a la cursada venció, la ruta responde 404 y esto no se dibuja.
 */
function SolicitudDeProrroga({
  assessmentId,
  zona,
  onDecidido,
}: {
  assessmentId: string;
  zona: string;
  onDecidido: () => void;
}) {
  const [estado, setEstado] = useState<EstadoDePedido | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const url = `/api/portal/me/assessments/${encodeURIComponent(assessmentId)}/extension-request`;

  const cargar = useCallback(async () => {
    const res = await fetch(url).catch(() => null);
    if (!res?.ok) {
      setEstado(null);
      return;
    }
    setEstado((await res.json()) as EstadoDePedido);
  }, [url]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (!estado) return null;

  async function pedir(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fecha, motivo: motivo.trim() }),
    }).catch(() => null);
    setEnviando(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      notify.error(body?.error?.message ?? "No pudimos enviar tu pedido. Probá de nuevo en unos minutos.");
      return;
    }
    notify.success("Pedido enviado. Te avisamos acá cuando lo resuelvan.");
    setAbierto(false);
    setFecha("");
    setMotivo("");
    await cargar();
    onDecidido();
  }

  const pedido = estado.pedido;

  return (
    <div className="space-y-2">
      {pedido?.status === "pendiente" && (
        <p className="inline-flex flex-wrap items-center gap-1.5 text-xs text-text-2">
          <ChipDeEstado tono="aviso">Prórroga solicitada</ChipDeEstado>
          Pediste hasta el {fechaYHora(pedido.requestedDueAt, zona)}. Está esperando respuesta.
        </p>
      )}
      {pedido?.status === "aprobada" && (
        <p className="inline-flex flex-wrap items-center gap-1.5 text-xs text-text-2">
          <ChipDeEstado tono="ok">Prórroga aprobada</ChipDeEstado>
          {pedido.decisionNote}
        </p>
      )}
      {pedido?.status === "rechazada" && (
        <p className="inline-flex flex-wrap items-center gap-1.5 text-xs text-text-2">
          <ChipDeEstado tono="atencion">Prórroga no aprobada</ChipDeEstado>
          {pedido.decisionNote}
        </p>
      )}

      {estado.puedePedir && !abierto && (
        <Button variant="outline" size="sm" onClick={() => setAbierto(true)}>
          <Clock className="h-4 w-4" />
          Solicitar prórroga
        </Button>
      )}

      {estado.puedePedir && abierto && (
        <form onSubmit={pedir} className="space-y-3 rounded-md border border-border bg-subtle p-3">
          <div className="space-y-1.5">
            <Label htmlFor={`prorroga-fecha-${assessmentId}`}>¿Hasta qué día necesitás?</Label>
            <Input
              id={`prorroga-fecha-${assessmentId}`}
              type="date"
              required
              className="h-11"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
            <p className="text-xs text-text-3">
              Hasta las 23:59 de ese día
              {estado.vigenteAt && `. Tu plazo actual: ${fechaYHora(estado.vigenteAt, zona)}`}.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`prorroga-motivo-${assessmentId}`}>Motivo</Label>
            <textarea
              id={`prorroga-motivo-${assessmentId}`}
              required
              minLength={3}
              maxLength={1000}
              rows={3}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={enviando} disabled={!fecha || motivo.trim().length < 3}>
              Enviar pedido
            </Button>
            <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
