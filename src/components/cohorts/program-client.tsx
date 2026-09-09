"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, GraduationCap, MoveRight, RotateCcw, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type State = "aprobado" | "reprobado" | "pendiente";

type Modulo = {
  cohortId: string;
  courseId: string;
  name: string;
  position: number | null;
  ordinal: number | null;
  label: string;
  teacher: { id: string; name: string } | null;
  startDate: string | null;
  endDate: string | null;
  minAttendancePct: number | null;
  clases: {
    total: number;
    dictadas: number;
    canceladas: number;
    sinCronograma: boolean;
    cannotGenerateReason: string | null;
  };
};

type ModuloDelAlumno = {
  enrollmentId: string;
  cohortId: string | null;
  courseId: string | null;
  cohortName: string;
  position: number | null;
  ordinal: number | null;
  label: string;
  state: State;
  reasons: string[];
  attendancePct: number | null;
  minAttendancePct: number | null;
  dispensada: boolean;
  otraCamada: boolean;
  camadaId: string | null;
  camadaName: string | null;
};

type Alumno = {
  enrollmentId: string;
  contact: { id: string; name: string };
  state: State;
  reasons: string[];
  modules: ModuloDelAlumno[];
};

type Programa = {
  cohortId: string;
  name: string;
  courseName: string;
  modules: Modulo[];
  students?: Alumno[];
};

/** Lo mínimo del listado de cohortes para poder elegir la otra camada. */
type CohortOption = {
  id: string;
  name: string | null;
  courseId: string;
  courseName: string;
  parentCohortId: string | null;
  startDate: string;
};

/**
 * Los cuatro actos que se pueden hacer sobre la celda de un alumno.
 *
 * Los dos de US4 mueven la cursada; los dos de US6 tocan la dispensa, y son
 * DOS y no un interruptor a propósito (DV-004): otorgar y revocar tienen cada
 * uno su motivo, y quien revoca tiene que escribir por qué igual que quien
 * otorgó.
 */
type Via = "baja" | "recursada" | "dispensar" | "revocar-dispensa";

const ESTADO: Record<State, { label: string; variant: "success" | "destructive" | "warning" }> = {
  aprobado: { label: "Aprobado", variant: "success" },
  reprobado: { label: "Reprobado", variant: "destructive" },
  pendiente: { label: "Pendiente", variant: "warning" },
};

function fecha(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("es-UY", { timeZone: "UTC" }) : "—";
}

/**
 * 028 fase 4 (US3, mitad staff) — La especialización, entera y en una pantalla.
 *
 * Es el pedido literal del dueño: los módulos en orden, quién los dicta, cómo
 * va el cronograma y cómo va cada alumno **por módulo**, sin abrir cuatro
 * pantallas y anotar a mano.
 *
 * Dos reglas gobiernan lo que se dibuja acá y ninguna es cosmética:
 *
 * - **`position` ordena, el nombre rotula.** El número guardado no se imprime:
 *   el ordinal sale del servidor ya derivado del lugar en la lista. Quien
 *   carga 10/20/30 para dejar hueco entre módulos ve "Módulo 1, 2 y 3".
 * - **Un módulo sin cronograma se muestra igual**, diciendo que todavía no
 *   tiene clases y ofreciendo ir a generarlas. Ocultarlo es exactamente de
 *   donde salieron los 0 `class_session` de las 9 camadas reales: un módulo
 *   invisible es un módulo que nadie carga.
 *
 * Y una que gobierna lo que NO se dibuja: los botones de US4 sólo aparecen con
 * `inscripciones.editar`. Esconderlos no protege nada —la ruta tiene su propio
 * `requireCapability`—; el front oculta, el servidor prohíbe.
 */
export function ProgramClient({
  cohortId,
  canEditEnrollments,
  canEditGrading,
}: {
  cohortId: string;
  /** `inscripciones.editar` — mover una cursada o armar una recursada (US4). */
  canEditEnrollments: boolean;
  /**
   * `evaluacion.editar` (DV-003) — otorgar y revocar la dispensa de
   * asistencia (US6). Es la misma capacidad que corrige una evaluación
   * porque lo que cambia es si el alumno aprueba, no quién pasó lista.
   */
  canEditGrading: boolean;
}) {
  const [data, setData] = useState<Programa | null>(null);
  const [cohorts, setCohorts] = useState<CohortOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  /** Qué celda tiene el panel de US4 abierto, y por cuál de los dos caminos. */
  const [accion, setAccion] = useState<{
    alumno: Alumno;
    modulo: ModuloDelAlumno;
    via: Via;
  } | null>(null);
  const [destino, setDestino] = useState("");
  const [monto, setMonto] = useState("");
  /** US6/FR-023 — el motivo de la dispensa: sin él no hay dispensa. */
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/cohorts/${cohortId}/program`).catch(() => null);
    if (!res?.ok) {
      setError("No se pudo cargar la especialización");
      setLoading(false);
      return;
    }
    setData((await res.json()) as Programa);
    setError(null);
    setLoading(false);
  }, [cohortId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  /**
   * Las candidatas de US4 salen del listado de cohortes que ya existe: son las
   * cohortes de MÓDULO (`parentCohortId` no nulo) del mismo curso que el
   * módulo que se está moviendo. Elegir la camada es una decisión de
   * coordinación —el CRM no sabe cupos ni disponibilidad—, así que se ofrecen
   * y no se adivinan.
   */
  useEffect(() => {
    if (!canEditEnrollments) return;
    void (async () => {
      const res = await fetch("/api/cohorts").catch(() => null);
      if (!res?.ok) return;
      const body = (await res.json()) as { cohorts: CohortOption[] };
      setCohorts(body.cohorts);
    })();
  }, [canEditEnrollments]);

  const nombreDeCamada = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cohorts) m.set(c.id, c.name ?? c.courseName);
    return m;
  }, [cohorts]);

  const candidatas = useMemo(() => {
    if (!accion) return [];
    return cohorts
      .filter(
        (c) =>
          c.parentCohortId !== null &&
          c.id !== accion.modulo.cohortId &&
          c.courseId === accion.modulo.courseId
      )
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [accion, cohorts]);

  function abrir(alumno: Alumno, modulo: ModuloDelAlumno, via: Via) {
    setAccion({ alumno, modulo, via });
    setDestino("");
    setMonto("");
    setMotivo("");
    setAviso(null);
    setError(null);
  }

  const esDispensa =
    accion?.via === "dispensar" || accion?.via === "revocar-dispensa";

  /**
   * US6 — Otorgar y revocar la dispensa de asistencia.
   *
   * Los dos actos van a la MISMA ruta con verbos distintos, y los dos exigen
   * motivo: una dispensa sin motivo es indistinguible de un error de cálculo
   * (FR-023), y quitarle a alguien una habilitación sin decir por qué es tan
   * poco auditable como dársela.
   *
   * Revocar la dispensa NO anula el certificado (DV-004). Si ya se emitió, hay
   * que decidirlo y pedirlo aparte — y por eso el aviso lo dice.
   */
  async function confirmarDispensa() {
    if (!accion || motivo.trim().length < 3) return;
    setGuardando(true);
    setError(null);

    const res = await fetch(`/api/enrollments/${accion.modulo.enrollmentId}/dispensa`, {
      method: accion.via === "dispensar" ? "POST" : "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ motivo: motivo.trim() }),
    }).catch(() => null);

    setGuardando(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(body?.error?.message ?? "No se pudo registrar la dispensa");
      return;
    }

    const via = accion.via;
    setAccion(null);
    setAviso(
      via === "dispensar"
        ? "Dispensa otorgada. El motivo, con tu nombre y la fecha, aparece junto al estado del alumno."
        : "Dispensa revocada. El certificado, si ya se emitió, sigue vigente: anularlo es un acto aparte."
    );
    void refetch();
  }

  async function confirmar() {
    if (!accion || !destino) return;
    setGuardando(true);
    setError(null);

    const res =
      accion.via === "baja"
        ? await fetch(`/api/enrollments/${accion.modulo.enrollmentId}/cohort`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ cohortId: destino }),
          }).catch(() => null)
        : await fetch("/api/enrollments", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              cohortId: destino,
              contactId: accion.alumno.contact.id,
              parentEnrollmentId: accion.alumno.enrollmentId,
              amount: monto.trim() === "" ? null : Number(monto),
            }),
          }).catch(() => null);

    setGuardando(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(body?.error?.message ?? "No se pudo registrar el cambio de camada");
      return;
    }

    setAccion(null);
    setAviso(
      accion.via === "baja"
        ? "Módulo mudado a la otra camada. La madre y el plan de cuotas del paquete quedaron intactos."
        : "Recursada creada. Cargale su plan de cuotas desde la pestaña de cobranza de esa inscripción."
    );
    void refetch();
  }

  if (loading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  /**
   * "No pudimos cargarlo" y "no tiene módulos" son dos hechos DISTINTOS, y
   * mezclarlos convierte un fallo de red en una afirmación falsa sobre el
   * programa de la academia. Es el mismo error que el ciclo 013 ya pagó caro
   * en el legajo: un default optimista dicho como si fuera un dato.
   *
   * Por eso el error se mira PRIMERO, y ofrece reintentar en vez de explicar
   * cómo armar una especialización que probablemente ya esté armada.
   */
  if (error && !data) {
    return (
      <div className="space-y-3 p-6">
        <p className="text-sm text-danger">{error}</p>
        <Button variant="outline" onClick={() => void refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (!data || data.modules.length === 0) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Esta camada no tiene módulos: no es una especialización. Para armarla, editá
        cada camada de módulo y elegí ésta como camada padre.
      </p>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {aviso ? <p className="text-sm text-success">{aviso}</p> : null}

      {/* Los módulos en orden, cada uno con su profesor, sus fechas y su avance. */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.modules.map((m) => (
          <article key={m.cohortId} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">{m.label}</h3>
              {m.clases.sinCronograma ? (
                <Badge variant="warning">Sin cronograma</Badge>
              ) : (
                <Badge variant="secondary">
                  {m.clases.dictadas}/{m.clases.total} clases
                </Badge>
              )}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <GraduationCap className="h-3.5 w-3.5" aria-hidden />
              {m.teacher?.name ?? "Sin profesor asignado"}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              {fecha(m.startDate)} — {fecha(m.endDate)}
            </p>
            {/*
              US3 — El módulo sin cronograma NO se oculta: se muestra diciendo
              qué le falta. De ahí vienen los 0 `class_session` de hoy.
            */}
            {m.clases.sinCronograma ? (
              <p className="mt-2 text-xs text-warning">
                {m.clases.cannotGenerateReason ??
                  `Todavía no tiene clases cargadas${
                    m.clases.total > 0 ? ` (${m.clases.total} proyectadas)` : ""
                  }. Generá el cronograma desde la camada del módulo.`}
              </p>
            ) : m.clases.canceladas > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {m.clases.canceladas} cancelada{m.clases.canceladas === 1 ? "" : "s"}
              </p>
            ) : null}
          </article>
        ))}
      </section>

      {/* La grilla: una fila por alumno, una celda por módulo cursado. */}
      {data.students === undefined ? (
        <p className="text-sm text-muted-foreground">
          El estado de aprobación por módulo requiere permiso de evaluación.
        </p>
      ) : data.students.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay nadie inscripto en esta especialización.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Alumno</TableHead>
              <TableHead>Especialización</TableHead>
              {data.modules.map((m) => (
                <TableHead key={m.cohortId}>{m.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.students.map((a) => (
              <TableRow key={a.enrollmentId}>
                <TableCell className="font-medium">{a.contact.name}</TableCell>
                <TableCell>
                  <Badge variant={ESTADO[a.state].variant}>{ESTADO[a.state].label}</Badge>
                  {a.reasons.length > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {a.reasons.join(" · ")}
                    </p>
                  ) : null}
                </TableCell>
                {data.modules.map((col) => {
                  /*
                    Primero por cohorte —la corrida exacta— y si no, por CURSO:
                    quien recursó el módulo 2 con EBIM 14 cursó ese mismo
                    módulo, en otra corrida. Buscando sólo por `cohortId` esa
                    persona quedaría con la columna vacía, que es justo aquella
                    sobre la que la pantalla tiene algo que decir.
                  */
                  const celda =
                    a.modules.find((m) => m.cohortId === col.cohortId) ??
                    a.modules.find((m) => m.courseId === col.courseId);
                  if (!celda) {
                    return (
                      <TableCell key={col.cohortId} className="text-muted-foreground">
                        —
                      </TableCell>
                    );
                  }
                  return (
                    <TableCell key={col.cohortId}>
                      <Badge variant={ESTADO[celda.state].variant}>
                        {ESTADO[celda.state].label}
                      </Badge>
                      {celda.dispensada ? (
                        <p className="mt-1 text-xs text-warning">Con dispensa</p>
                      ) : null}
                      {/*
                        FR-025 — el motivo NO alcanza con que viaje: tiene que
                        leerse. "Con dispensa" dice que la hay; esta línea dice
                        quién la otorgó, cuándo y por qué —y también, cuando no
                        hay dispensa, por qué el módulo está como está—. Sin
                        ella la celda afirma un estado que nadie puede
                        explicar, que es la dispensa silenciosa que la decisión
                        4 prohíbe.
                      */}
                      {celda.reasons.length > 0 ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {celda.reasons.join(" · ")}
                        </p>
                      ) : null}
                      {celda.otraCamada ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Cursa con {celda.camadaName ?? "otra camada"}
                        </p>
                      ) : null}
                      <div className="mt-1 flex flex-wrap gap-1">
                        {canEditEnrollments ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => abrir(a, celda, "baja")}
                            >
                              <MoveRight className="mr-1 h-3 w-3" aria-hidden />
                              Mudar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => abrir(a, celda, "recursada")}
                            >
                              <RotateCcw className="mr-1 h-3 w-3" aria-hidden />
                              Recursar
                            </Button>
                          </>
                        ) : null}
                        {/*
                          US6 — el botón dice cuál de los dos actos ofrece,
                          nunca "dispensa" a secas: con una vigente lo único
                          que queda por hacer es quitarla, y un interruptor sin
                          motivo sería exactamente la dispensa silenciosa que
                          FR-025 prohíbe.
                        */}
                        {canEditGrading ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              abrir(
                                a,
                                celda,
                                celda.dispensada ? "revocar-dispensa" : "dispensar"
                              )
                            }
                          >
                            <ShieldCheck className="mr-1 h-3 w-3" aria-hidden />
                            {celda.dispensada ? "Quitar dispensa" : "Dispensar"}
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/*
        US4 — Los dos caminos, con la diferencia dicha en palabras. Son el mismo
        mecanismo y se distinguen sólo por la plata, así que la pantalla tiene
        que decir cuál se está eligiendo: mudar no cobra nada, recursar sí.
      */}
      {/*
        US6 — La dispensa, con su motivo obligatorio. Es el panel más corto de
        la pantalla y el que más se justifica: el texto que se escribe acá es
        lo que, a los seis meses, permite distinguir una habilitación del dueño
        de un error de cálculo.
      */}
      {accion && esDispensa ? (
        <div className="rounded-lg border bg-card p-4">
          <h4 className="text-sm font-semibold text-foreground">
            {accion.via === "dispensar"
              ? `Dispensar la asistencia de ${accion.modulo.label} — ${accion.alumno.contact.name}`
              : `Quitar la dispensa de ${accion.modulo.label} — ${accion.alumno.contact.name}`}
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            {accion.via === "dispensar"
              ? "Habilita la aprobación de ESTE módulo pese a no llegar al mínimo de asistencia. No perdona evaluaciones: una obligatoria desaprobada sigue reprobando. El porcentaje real no cambia — queda a la vista, junto al motivo, tu nombre y la fecha."
              : "La dispensa deja de tener efecto y el módulo vuelve a exigir su asistencia. El acto original se conserva. Si ya se emitió el certificado, éste NO se anula: es una decisión aparte y explícita."}
          </p>

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex min-w-[18rem] flex-1 flex-col gap-1 text-xs text-muted-foreground">
              Motivo
              <Input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder={
                  accion.via === "dispensar"
                    ? "Avisó antes de empezar que se iba de viaje"
                    : "Se comprobó que la razón no era la declarada"
                }
              />
            </label>

            <Button
              onClick={() => void confirmarDispensa()}
              disabled={motivo.trim().length < 3 || guardando}
            >
              {guardando ? "Guardando…" : "Confirmar"}
            </Button>
            <Button variant="ghost" onClick={() => setAccion(null)}>
              Cancelar
            </Button>
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            Sin motivo no hay dispensa: quien la lea dentro de seis meses tiene
            que poder entender por qué se otorgó sin preguntarle a nadie.
          </p>
        </div>
      ) : null}

      {accion && !esDispensa ? (
        <div className="rounded-lg border bg-card p-4">
          <h4 className="text-sm font-semibold text-foreground">
            {accion.via === "baja"
              ? `Mudar ${accion.modulo.label} de ${accion.alumno.contact.name} a otra camada`
              : `Recursar ${accion.modulo.label} — ${accion.alumno.contact.name}`}
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            {accion.via === "baja"
              ? "Baja voluntaria: la misma cursada pasa a la camada siguiente. No se toca ni la inscripción madre ni el plan de cuotas del paquete: ya está pago."
              : "Recursada tras reprobar: se crea una cursada NUEVA con su propio monto y su propio plan de cuotas. El intento anterior se conserva — es la evidencia de por qué hay que recursar."}
          </p>

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Camada de destino
              <Select value={destino} onChange={(e) => setDestino(e.target.value)}>
                <option value="">Elegí una camada…</option>
                {candidatas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {(c.name ?? c.courseName) +
                      (c.parentCohortId
                        ? ` — ${nombreDeCamada.get(c.parentCohortId) ?? "otra camada"}`
                        : "")}
                  </option>
                ))}
              </Select>
            </label>

            {accion.via === "recursada" ? (
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Monto del módulo
                <Input
                  inputMode="numeric"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="Sin monto"
                />
              </label>
            ) : null}

            <Button onClick={() => void confirmar()} disabled={!destino || guardando}>
              {guardando ? "Guardando…" : "Confirmar"}
            </Button>
            <Button variant="ghost" onClick={() => setAccion(null)}>
              Cancelar
            </Button>
          </div>

          {candidatas.length === 0 ? (
            <p className="mt-2 text-xs text-warning">
              No hay ninguna otra camada con este módulo cargado. Creala primero y
              colgala de su especialización.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
