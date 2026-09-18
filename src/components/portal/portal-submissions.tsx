"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, ExternalLink, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * 016 (US2, US3, US5) — Las entregas de la cohorte, para el profesor.
 *
 * Lo que esta pantalla tiene que contestar, en este orden: **quién entregó**,
 * **quién llegó tarde** y **qué falta corregir**. Por eso se agrupa por
 * evaluación y no por alumno: el profesor se sienta a corregir UNA entrega de
 * los veinte, no las cuatro de uno.
 *
 * **La descarga ocurre fuera de la plataforma** y es la consecuencia asumida de
 * la decisión marco: el sistema guarda el enlace, no el archivo. El botón abre
 * otra pestaña, y eso se dice con todas las letras para que nadie espere un
 * visor acá adentro.
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

type Alumno = {
  enrollmentId: string;
  studentName: string;
  prorroga: { dueAt: string; reason: string; grantedByName: string | null } | null;
  vigenteAt: string | null;
  estado: Estado;
  entregas: Entrega[];
};

type Evaluacion = {
  assessmentId: string;
  assessmentName: string;
  required: boolean;
  dueAt: string | null;
  students: Alumno[];
};

const ESTADO: Record<Estado, { label: string; className: string }> = {
  sin_entrega: { label: "Sin entregar", className: "border-border bg-secondary text-text-2" },
  entregada: {
    label: "Entregada",
    className: "border-success-border bg-success-soft text-success",
  },
  /** SC-003 — a simple vista, y sin rechazar nada: decide el profesor. */
  tardia: {
    label: "Fuera de plazo",
    className: "border-warning-border bg-warning-soft text-warning",
  },
  corregida: { label: "Corregida", className: "border-border bg-secondary text-text-2" },
};

/**
 * FR-005e — El plazo se pinta en la zona de la ACADEMIA, no en la de quien
 * mira. El profesor carga "23:59" de la academia; leyéndolo con el reloj del
 * navegador, desde Asunción ve otra hora y cree que el plazo se movió.
 */
function fechaYHora(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("es-UY", {
    timeZone,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

type Payload = { timezone: string; assessments: Evaluacion[] };

/** Sin evaluaciones no hay ninguna fecha que pintar: la zona no se usa. */
const SIN_DATOS: Payload = { timezone: "UTC", assessments: [] };

export function PortalSubmissions({ cohortId }: { cohortId: string }) {
  const [datos, setDatos] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/portal/cohorts/${cohortId}/entregas`).catch(() => null);
    if (res?.ok) {
      setDatos((await res.json()) as Payload);
    } else {
      setDatos(SIN_DATOS);
    }
  }, [cohortId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (!datos) return <Skeleton className="h-40 w-full" />;

  if (datos.assessments.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Esta cohorte todavía no tiene evaluaciones cargadas. Las define la
        academia; cuando estén, vas a ver acá lo que entregue cada alumno.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {datos.assessments.map((e) => (
        <EvaluacionBloque
          key={e.assessmentId}
          evaluacion={e}
          zona={datos.timezone}
          onCambio={refetch}
          onError={setError}
        />
      ))}
    </div>
  );
}

function EvaluacionBloque({
  evaluacion,
  zona,
  onCambio,
  onError,
}: {
  evaluacion: Evaluacion;
  /** FR-005e — la zona de la academia, la única con la que se lee un plazo. */
  zona: string;
  onCambio: () => void;
  onError: (m: string | null) => void;
}) {
  const [editandoPlazo, setEditandoPlazo] = useState(false);
  const pendientes = evaluacion.students.filter(
    (s) => s.estado === "entregada" || s.estado === "tardia"
  ).length;

  return (
    <section className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{evaluacion.assessmentName}</h3>
          <p className="text-xs text-muted-foreground">
            {evaluacion.dueAt
              ? `Entrega hasta el ${fechaYHora(evaluacion.dueAt, zona)}`
              : "Sin fecha límite"}
            {pendientes > 0 && ` · ${pendientes} sin corregir`}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditandoPlazo((v) => !v)}
        >
          <CalendarClock className="h-4 w-4" />
          {evaluacion.dueAt ? "Cambiar plazo" : "Poner plazo"}
        </Button>
      </div>

      {editandoPlazo && (
        <PlazoDelGrupo
          assessmentId={evaluacion.assessmentId}
          tienePlazo={evaluacion.dueAt !== null}
          onListo={() => {
            setEditandoPlazo(false);
            onCambio();
          }}
          onError={onError}
        />
      )}

      {evaluacion.students.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
          Esta cohorte todavía no tiene alumnos inscriptos.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {evaluacion.students.map((a) => (
            <AlumnoFila
              key={a.enrollmentId}
              assessmentId={evaluacion.assessmentId}
              alumno={a}
              zona={zona}
              onCambio={onCambio}
              onError={onError}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function AlumnoFila({
  assessmentId,
  alumno,
  zona,
  onCambio,
  onError,
}: {
  assessmentId: string;
  alumno: Alumno;
  zona: string;
  onCambio: () => void;
  onError: (m: string | null) => void;
}) {
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [prorrogando, setProrrogando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const ultima = alumno.entregas[0] ?? null;

  async function reabrir() {
    setOcupado(true);
    const res = await fetch(`/api/portal/entregas/${ultima?.id}/reabrir`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).catch(() => null);
    setOcupado(false);
    if (!res?.ok) {
      /*
        El motivo lo da el servidor y hay que mostrarlo: con la cohorte ya
        finalizada, "no se pudo" manda al profesor a preguntar por WhatsApp,
        mientras que la frase del servidor dice qué pasó y que no hay nada que
        reintentar.
      */
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      onError(body?.error?.message ?? "No se pudo reabrir la entrega.");
      return;
    }
    onError(null);
    onCambio();
  }

  return (
    <li className="space-y-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {alumno.studentName}
        </span>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${ESTADO[alumno.estado].className}`}
        >
          {ESTADO[alumno.estado].label}
        </span>
      </div>

      {/* FR-005c — la fecha que de verdad rige para ESTA persona. */}
      {alumno.prorroga && (
        <p className="text-xs text-muted-foreground">
          Prórroga hasta el {fechaYHora(alumno.prorroga.dueAt, zona)} —{" "}
          {alumno.prorroga.reason}
          {alumno.prorroga.grantedByName && ` (${alumno.prorroga.grantedByName})`}
        </p>
      )}

      {ultima ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {/*
              La descarga ocurre FUERA de la plataforma: el sistema guarda el
              enlace, no el archivo. Abre en otra pestaña a propósito.
            */}
            <a
              href={ultima.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[32px] items-center gap-1.5 text-sm underline"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              {ultima.title ?? "Abrir la entrega"}
            </a>
            <span className="text-xs text-muted-foreground">
              {fechaYHora(ultima.submittedAt, zona)}
            </span>
            {alumno.entregas.length > 1 && (
              <span className="text-xs text-muted-foreground">
                · {alumno.entregas.length} entregas
              </span>
            )}
          </div>

          {ultima.feedback && (
            <p className="whitespace-pre-line rounded-md border bg-subtle p-2 text-xs text-text-2">
              {ultima.feedback}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCorrigiendo((v) => !v)}
            >
              {ultima.correctedAt ? "Corregir de nuevo" : "Corregir"}
            </Button>
            {/*
              FR-013 — Reabrir es lo ÚNICO que habilita al alumno a volver a
              entregar. No borra la corrección: la reentrega va a ser una fila
              nueva y la anterior queda (FR-008).
            */}
            <Button size="sm" variant="outline" disabled={ocupado} onClick={() => void reabrir()}>
              <RotateCcw className="h-4 w-4" />
              {ultima.reopenedAt ? "Reabierta" : "Reabrir"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setProrrogando((v) => !v)}>
              Dar prórroga
            </Button>
          </div>

          {corrigiendo && (
            <FormularioDeCorreccion
              submissionId={ultima.id}
              onListo={() => {
                setCorrigiendo(false);
                onCambio();
              }}
              onError={onError}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">Todavía no entregó.</p>
          <Button size="sm" variant="outline" onClick={() => setProrrogando((v) => !v)}>
            Dar prórroga
          </Button>
        </div>
      )}

      {prorrogando && (
        <FormularioDeProrroga
          assessmentId={assessmentId}
          enrollmentId={alumno.enrollmentId}
          onListo={() => {
            setProrrogando(false);
            onCambio();
          }}
          onError={onError}
        />
      )}
    </li>
  );
}

/**
 * FR-005e — Se cargan un DÍA y una HORA, y el instante lo compone el servidor
 * con la zona de la academia. El navegador no manda una fecha armada: el
 * profesor puede estar en otro país, y ahí "23:59" no significa lo mismo.
 */
function CamposDePlazo({
  fecha,
  hora,
  setFecha,
  setHora,
  idBase,
}: {
  fecha: string;
  hora: string;
  setFecha: (v: string) => void;
  setHora: (v: string) => void;
  idBase: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${idBase}-fecha`}>Fecha</Label>
        <Input
          id={`${idBase}-fecha`}
          type="date"
          required
          className="h-11"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idBase}-hora`}>Hora</Label>
        <Input
          id={`${idBase}-hora`}
          type="time"
          required
          className="h-11"
          value={hora}
          onChange={(e) => setHora(e.target.value)}
        />
      </div>
    </div>
  );
}

function PlazoDelGrupo({
  assessmentId,
  tienePlazo,
  onListo,
  onError,
}: {
  assessmentId: string;
  tienePlazo: boolean;
  onListo: () => void;
  onError: (m: string | null) => void;
}) {
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("23:59");
  const [guardando, setGuardando] = useState(false);

  async function guardar(plazo: { fecha: string; hora: string } | null) {
    setGuardando(true);
    const res = await fetch(`/api/portal/assessments/${assessmentId}/plazo`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plazo }),
    }).catch(() => null);
    setGuardando(false);
    if (!res?.ok) {
      // El servidor ya explicó por qué (cohorte finalizada, hora imposible):
      // repetirlo con un "no se pudo" borraría el único dato accionable.
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      onError(body?.error?.message ?? "No se pudo guardar el plazo.");
      return;
    }
    onError(null);
    onListo();
  }

  return (
    <div className="space-y-3 rounded-md border border-dashed p-3">
      <p className="text-xs text-muted-foreground">
        La fecha vale para toda la cohorte. Pasada la fecha, las entregas se
        siguen aceptando marcadas como fuera de plazo: quien decide si las toma
        sos vos.
      </p>
      <CamposDePlazo
        fecha={fecha}
        hora={hora}
        setFecha={setFecha}
        setHora={setHora}
        idBase={`grupo-${assessmentId}`}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!fecha || guardando}
          onClick={() => void guardar({ fecha, hora })}
        >
          Guardar plazo
        </Button>
        {/* Sin plazo es un estado legítimo (DV-001), así que se puede volver. */}
        {tienePlazo && (
          <Button
            size="sm"
            variant="outline"
            disabled={guardando}
            onClick={() => void guardar(null)}
          >
            Quitar el plazo
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * FR-005b — La prórroga individual. **Sin motivo no hay prórroga**: una
 * excepción sin autor ni motivo es indistinguible de un error de carga, y a
 * los seis meses nadie puede decidir cuál de las dos cosas fue.
 */
function FormularioDeProrroga({
  assessmentId,
  enrollmentId,
  onListo,
  onError,
}: {
  assessmentId: string;
  enrollmentId: string;
  onListo: () => void;
  onError: (m: string | null) => void;
}) {
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("23:59");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    const res = await fetch(`/api/portal/assessments/${assessmentId}/plazo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enrollmentId,
        plazo: { fecha, hora },
        motivo: motivo.trim(),
      }),
    }).catch(() => null);
    setGuardando(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      onError(body?.error?.message ?? "No se pudo dar la prórroga.");
      return;
    }
    onError(null);
    onListo();
  }

  return (
    <form onSubmit={guardar} className="space-y-3 rounded-md border border-dashed p-3">
      <CamposDePlazo
        fecha={fecha}
        hora={hora}
        setFecha={setFecha}
        setHora={setHora}
        idBase={`prorroga-${assessmentId}-${enrollmentId}`}
      />
      <div className="space-y-1.5">
        <Label htmlFor={`motivo-${assessmentId}-${enrollmentId}`}>Motivo</Label>
        <Input
          id={`motivo-${assessmentId}-${enrollmentId}`}
          required
          className="h-11"
          placeholder="Avisó antes que se iba de viaje"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </div>
      <Button type="submit" size="sm" disabled={!fecha || guardando}>
        Dar la prórroga
      </Button>
    </form>
  );
}

/**
 * US3/FR-007 — Corregir: aprobar o no, y escribir la devolución.
 *
 * La devolución es obligatoria y no es una validación de forma: **un "no
 * aprobado" sin explicación no le sirve de nada al alumno**, que es
 * textualmente lo que pide la fase.
 *
 * Al guardar se escribe también el resultado de la evaluación (010) en el
 * mismo movimiento: el doble paso es la razón por la que hoy los datos no se
 * cargan.
 */
function FormularioDeCorreccion({
  submissionId,
  onListo,
  onError,
}: {
  submissionId: string;
  onListo: () => void;
  onError: (m: string | null) => void;
}) {
  const [passed, setPassed] = useState("si");
  const [feedback, setFeedback] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    const res = await fetch(`/api/portal/entregas/${submissionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passed: passed === "si", feedback: feedback.trim() }),
    }).catch(() => null);
    setGuardando(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      onError(body?.error?.message ?? "No se pudo guardar la corrección.");
      return;
    }
    onError(null);
    onListo();
  }

  return (
    <form onSubmit={guardar} className="space-y-3 rounded-md border border-dashed p-3">
      <div className="space-y-1.5">
        <Label htmlFor={`resultado-${submissionId}`}>Resultado</Label>
        <Select
          id={`resultado-${submissionId}`}
          className="h-11"
          value={passed}
          onChange={(e) => setPassed(e.target.value)}
        >
          <option value="si">Aprobó</option>
          <option value="no">No aprobó</option>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`devolucion-${submissionId}`}>Devolución</Label>
        <textarea
          id={`devolucion-${submissionId}`}
          required
          rows={3}
          className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
          placeholder="Qué está bien, qué hay que corregir y con qué criterio."
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          La lee el alumno. Guardar también carga el resultado en la planilla de
          evaluación: no hay que cargarlo dos veces.
        </p>
      </div>
      <Button type="submit" size="sm" disabled={feedback.trim().length < 3 || guardando}>
        Guardar corrección
      </Button>
    </form>
  );
}
