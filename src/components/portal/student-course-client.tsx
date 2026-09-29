"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Clock,
  FileText,
  Megaphone,
  Minus,
  Play,
  Video,
  X,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ApprovalBadge,
  ClassTime,
  EmptyNote,
  PortalCard,
  formatDate,
} from "@/components/portal/student-bits";
import type { ApprovalValue } from "@/components/portal/student-bits";
import { StudentMilestones, type Milestone } from "@/components/portal/student-milestones";
import { StudentSubmissions } from "@/components/portal/student-submissions";
import {
  ChipDeEstado,
  EncabezadoDePagina,
  LeyendaDeProgreso,
  Metrica,
  ProgresoDeClases,
  Tarjeta,
  type TramoEstado,
} from "@/components/portal/campus";

/**
 * 015/024 — Una cursada del alumno.
 *
 * 024 — Era un listado hacia abajo: asistencia, evaluaciones, clases, avisos y
 * material, uno atrás del otro. Con doce clases eso son tres pantallas de
 * scroll, y lo que la persona vino a buscar —el enlace de la próxima, la
 * devolución de una entrega— queda enterrado.
 *
 * Ahora se separa en dos planos:
 *
 *  - **Fijo, al costado**: dónde está parada. El recorrido y el avance no son
 *    una sección más; son la respuesta a "¿cómo voy?", que es la pregunta con
 *    la que se entra.
 *  - **En pestañas**: el detalle, agrupado por lo que se viene a HACER.
 *    Clases (entrar, ver la grabación), Evaluaciones (cómo me fue), Material
 *    (bajar algo), Avisos (enterarme). Cuatro tareas distintas, cuatro
 *    lugares — y no cuatro secciones compitiendo por el mismo scroll.
 */

type AttendanceStatus = "presente" | "tarde" | "ausente" | "justificado";

type ClassRow = {
  id: string | null;
  number: number;
  date: string;
  startsAt: string | null;
  endsAt: string | null;
  topic: string | null;
  canceled: boolean;
  cancelReason: string | null;
  meetingUrl: string | null;
  recordingUrl: string | null;
  attendance: AttendanceStatus | null;
};

/**
 * 028 (US3, US4) — Un módulo de la especialización, tal como lo devuelve
 * `studentCourseDetail`. Es una cursada con su posición: tiene sus clases, su
 * asistencia, sus evaluaciones y su certificado, porque un módulo **es** una
 * cohorte.
 */
type Module = {
  enrollmentId: string;
  cohortName: string;
  courseName: string;
  teacherName: string | null;
  startDate: string | null;
  endDate: string | null;
  position: number | null;
  sinCronograma: boolean;
  otraCamada: boolean;
  camadaName: string | null;
  attendancePct: number | null;
  minAttendancePct: number | null;
  totalClasses: number;
  completedClasses: number;
  approval: ApprovalValue;
  approvalReasons: string[];
  assessments: {
    id: string;
    name: string;
    required: boolean;
    passed: boolean | null;
  }[];
  certificate: { code: string; issuedAt: string; revokedAt: string | null } | null;
};

type Detail = {
  course: {
    enrollmentId: string;
    cohortName: string;
    courseName: string;
    status: string;
    startDate: string | null;
    endDate: string | null;
    frequency: string | null;
    classroom: string | null;
    teacherName: string | null;
    attendancePct: number | null;
    attendedCount: number;
    eligibleCount: number;
    totalClasses: number;
    completedClasses: number;
    minAttendancePct: number | null;
    approval: ApprovalValue;
    approvalReasons: string[];
    assessments: {
      id: string;
      name: string;
      required: boolean;
      passed: boolean | null;
    }[];
    certificate: { code: string; issuedAt: string; revokedAt: string | null } | null;
    /** 028 (US3) — Ausente en la cursada simple (FR-032). */
    modules?: Module[];
  };
  timezone: string;
  classes: ClassRow[];
  announcements: {
    id: string;
    title: string;
    body: string;
    authorName: string | null;
    createdAt: string;
  }[];
  resources: { id: string; title: string; url: string; kind: string }[];
  milestones: Milestone[];
};

/**
 * La marca de asistencia de cada clase, como chip: el acento si viniste,
 * rojo si faltaste, punteado si la falta está justificada. Los mismos colores
 * que ProgresoDeClases, para que la lista y el progreso digan lo mismo.
 */
const ASISTENCIA: Record<
  AttendanceStatus,
  { label: string; tone: "curso" | "atencion" | "neutro"; Icon: typeof Check }
> = {
  presente: { label: "Presente", tone: "curso", Icon: Check },
  tarde: { label: "Tarde", tone: "curso", Icon: Clock },
  ausente: { label: "Ausente", tone: "atencion", Icon: X },
  justificado: { label: "Justificada", tone: "neutro", Icon: Minus },
};

type TabKey = "modulos" | "clases" | "evaluaciones" | "material" | "avisos";

export function StudentCourseClient({ enrollmentId }: { enrollmentId: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * `null` = todavía no eligió ninguna. La pestaña de arranque depende de si
   * la cursada tiene módulos, y eso recién se sabe cuando llega la respuesta:
   * fijarla en el `useState` obligaría a pisarla en un efecto, que es cómo se
   * pierde la pestaña que la persona acaba de tocar.
   */
  const [tab, setTab] = useState<TabKey | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/portal/me/cursadas/${enrollmentId}`).catch(() => null);
      if (!res?.ok) {
        setError(
          res?.status === 404
            ? "No se encontró este curso entre tus inscripciones."
            : "No se pudo cargar el curso. Intentá nuevamente más tarde."
        );
        return;
      }
      setData((await res.json()) as Detail);
    })();
  }, [enrollmentId]);

  if (error) {
    return (
      <div className="space-y-4">
        <Volver />
        <EmptyNote title={error} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-5 lg:grid-cols-[1fr_21rem]">
          <Skeleton className="h-64 w-full rounded-lg" />
          <Skeleton className="h-72 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  const { course } = data;
  const canceladas = data.classes.filter((c) => c.canceled).length;
  const modulos = course.modules ?? [];
  const activa: TabKey = tab ?? (modulos.length > 0 ? "modulos" : "clases");
  const ahora = Date.now();
  const siguiente =
    data.classes.find((c) => !c.canceled && new Date(c.startsAt ?? c.date).getTime() >= ahora)
      ?.number ?? null;

  const pestanas: { key: TabKey; label: string; count: number | null }[] = [
    // 028 (US3) — Los módulos van PRIMERO: en una especialización son la
    // cursada, y las clases sueltas de la camada madre no existen.
    ...(modulos.length > 0
      ? [{ key: "modulos" as const, label: "Módulos", count: modulos.length }]
      : []),
    { key: "clases", label: "Clases", count: data.classes.length || null },
    {
      key: "evaluaciones",
      label: "Evaluaciones",
      count: course.assessments.length || null,
    },
    { key: "material", label: "Material", count: data.resources.length || null },
    { key: "avisos", label: "Avisos", count: data.announcements.length || null },
  ];

  return (
    <div className="space-y-6">
      <EncabezadoDePagina
        migas={[
          { label: "Inicio", href: "/portal" },
          { label: course.courseName, href: null },
        ]}
        titulo={course.courseName}
        descripcion={
          <>
            {course.cohortName}
            {course.teacherName && ` · ${course.teacherName}`}
          </>
        }
        acciones={<ApprovalBadge value={course.approval} />}
      />

      <Tarjeta className="space-y-5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
          {modulos.length === 0 && course.totalClasses > 0 && (
            <Metrica
              etiqueta="Avance"
              valor={`${course.completedClasses} / ${course.totalClasses}`}
              nota={
                course.completedClasses >= course.totalClasses
                  ? "clases dictadas: todas"
                  : `faltan ${course.totalClasses - course.completedClasses} clases`
              }
            />
          )}
          <Metrica
            etiqueta="Fechas"
            valor={<span className="text-lg">{formatDate(course.startDate)}</span>}
            nota={course.endDate ? `hasta el ${formatDate(course.endDate)}` : undefined}
          />
          {course.frequency && (
            <Metrica etiqueta="Horario" valor={<span className="block text-base leading-snug">{course.frequency}</span>} />
          )}
          {course.classroom && (
            <Metrica etiqueta="Aula" valor={<span className="text-lg">{course.classroom}</span>} />
          )}
        </div>
        {modulos.length === 0 && (
          <ProgresoDeClases
            total={course.totalClasses}
            done={course.completedClasses}
            next={siguiente}
          />
        )}
      </Tarjeta>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="order-2 min-w-0 space-y-5 lg:order-1">
          {modulos.length > 0 ? (
            <ProgramCard course={course} modules={modulos} />
          ) : (
            <ProgressCard course={course} classes={data.classes} />
          )}

          <div>
            <div
              role="tablist"
              aria-label="Secciones del curso"
              className="flex flex-wrap border-b border-border sm:gap-x-1"
            >
              {pestanas.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  role="tab"
                  aria-selected={activa === p.key}
                  onClick={() => setTab(p.key)}
                  className={cn(
                    // 44px de alto: el portal se usa en el celular.
                    "relative flex min-h-[44px] items-center gap-1.5 px-2.5 text-sm font-semibold transition-colors sm:gap-2 sm:px-3",
                    activa === p.key
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {p.label}
                  {p.count !== null && (
                    <span
                      className={cn(
                        // En el celular el contador no entra: sin él, las pestañas van en una línea.
                        "hidden rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums sm:inline",
                        activa === p.key
                          ? "bg-brand-soft text-brand-text"
                          : "bg-secondary text-text-3"
                      )}
                    >
                      {p.count}
                    </span>
                  )}
                  {activa === p.key && (
                    <span
                      className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand"
                      aria-hidden
                    />
                  )}
                </button>
              ))}
            </div>

            <div className="pt-5">
              {activa === "modulos" && <ModulosTab modules={modulos} />}
              {activa === "clases" && (
                <ClasesTab
                  classes={data.classes}
                  academyZone={data.timezone}
                  canceladas={canceladas}
                />
              )}
              {activa === "evaluaciones" && (
                /*
                  016 — La pestaña pasa a ser "cómo me fue" Y "qué entregué":
                  son la misma pregunta partida en dos canales, que es el
                  problema que la fase vino a cerrar. El resultado oficial
                  sigue saliendo de la evaluación (010); la entrega, la fecha
                  y la devolución salen de `/api/portal/me/entregas`.
                */
                <StudentSubmissions
                  enrollmentId={course.enrollmentId}
                  assessments={course.assessments}
                  academyZone={data.timezone}
                />
              )}
              {activa === "material" && <MaterialTab resources={data.resources} />}
              {activa === "avisos" && <AvisosTab announcements={data.announcements} />}
            </div>
          </div>
        </div>

        {/*
          En celular el recorrido va PRIMERO. Al final quedaba después de doce
          clases de scroll, y es la respuesta a "¿cómo voy?" — la pregunta con
          la que se entra. En escritorio vuelve a la derecha, donde acompaña
          sin empujar el detalle hacia abajo.
        */}
        <div className="order-1 space-y-5 lg:order-2">
          <StudentMilestones milestones={data.milestones} />
          {course.certificate && !course.certificate.revokedAt && (
            <CertificateCard cert={course.certificate} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * Avance y asistencia, juntos
 * ============================================================ */

/**
 * La asistencia. El avance ("clase N de M") ya está en la tarjeta de arriba:
 * acá queda la otra pregunta, "¿voy bien?", con el mínimo marcado sobre el
 * progreso.
 */
function ProgressCard({ course, classes }: { course: Detail["course"]; classes: ClassRow[] }) {
  const ahora = Date.now();
  const estados: TramoEstado[] = classes.map((c) =>
    c.canceled
      ? "cancelada"
      : c.attendance === "presente" || c.attendance === "tarde"
        ? "asistio"
        : c.attendance === "ausente"
          ? "falto"
          : c.attendance === "justificado"
            ? "justificada"
            : new Date(c.startsAt ?? c.date).getTime() > ahora
              ? "futura"
              : "sin_registro"
  );
  const alcanza =
    course.attendancePct === null ||
    course.minAttendancePct === null ||
    course.attendancePct >= course.minAttendancePct;

  return (
    <PortalCard className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-lg font-semibold tracking-tight">
            Mi asistencia
          </p>
          {course.attendancePct !== null && (
            <p className="text-xs text-text-3">
              {course.attendedCount} de {course.eligibleCount} clases
              {course.minAttendancePct !== null && ` · mínimo ${course.minAttendancePct}%`}
            </p>
          )}
        </div>

        {course.attendancePct === null ? (
          // DV-003 — no se dibuja una barra en cero: 0% porque nadie pasó
          // lista no es 0% porque no vino.
          <p className="text-sm text-text-3">
            Aún no se registró asistencia en este curso.
          </p>
        ) : (
          <>
            <p
              className={cn(
                "text-4xl font-bold tabular-nums tracking-tight",
                !alcanza && "text-danger"
              )}
            >
              {course.attendancePct}%
            </p>
            {classes.length > 0 && (
              <div className="space-y-3 pb-5 pt-2">
                <ProgresoDeClases
                  total={classes.length}
                  done={0}
                  states={estados}
                  minPct={course.minAttendancePct}
                />
                <div className="pt-4">
                  <LeyendaDeProgreso estados={estados} />
                </div>
              </div>
            )}
          </>
        )}

        {course.approvalReasons.length > 0 && (
          <ul className="space-y-1 pt-1">
            {course.approvalReasons.map((r) => (
              <li key={r} className="text-xs text-text-3">
                {r}
              </li>
            ))}
          </ul>
        )}
      </div>
    </PortalCard>
  );
}

/* ============================================================
 * 028 (US3, US4, US5) — La especialización: sus módulos, en orden
 * ============================================================ */

/**
 * El resumen de la especialización, en el lugar donde una cursada simple
 * muestra su avance y su asistencia.
 *
 * **No hay un porcentaje de asistencia de la especialización** (Regla 5): cada
 * módulo tiene su cronograma y su propio mínimo, y promediarlos inventaría un
 * criterio que nadie decidió. Lo que sí se puede afirmar es cuántos módulos
 * están aprobados, y por qué falta el general.
 */
function ProgramCard({
  course,
  modules,
}: {
  course: Detail["course"];
  modules: Module[];
}) {
  const aprobados = modules.filter((m) => m.approval === "aprobado").length;
  /*
    Los módulos como progreso: un segmento por módulo. Aprobado es lleno, no
    aprobado es rojo, sin notas es punteado y en curso es lo que falta. La
    misma notación que las clases de un curso.
  */
  const estados: TramoEstado[] = modules.map((m) =>
    m.approval === "aprobado"
      ? "asistio"
      : m.approval === "reprobado"
        ? "falto"
        : m.approval === "sin_datos"
          ? "sin_registro"
          : "futura"
  );

  return (
    <PortalCard className="space-y-5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-lg font-semibold tracking-tight">
          Módulos aprobados
        </p>
        <p className="text-xl font-bold tabular-nums">
          {aprobados} / {modules.length}
        </p>
      </div>
      <ProgresoDeClases total={modules.length} done={0} states={estados} />
      <p className="text-xs text-text-3">
        {aprobados >= modules.length
          ? "Especialización completa."
          : `Faltan ${modules.length - aprobados}.`}{" "}
        La asistencia y la aprobación son por módulo: ingresá a cada módulo
        para consultar sus clases y evaluaciones.
      </p>

      {course.approvalReasons.length > 0 && (
        <ul className="space-y-1 border-t border-border pt-3">
          {course.approvalReasons.map((r) => (
            <li key={r} className="text-xs text-text-3">
              {r}
            </li>
          ))}
        </ul>
      )}
    </PortalCard>
  );
}

/**
 * Los módulos, en orden de `position`.
 *
 * Cada uno enlaza a SU cursada: un módulo es una cohorte, así que su pantalla
 * es la misma que la de cualquier otra cursada —clases, evaluaciones,
 * material, avisos— sin ninguna superficie nueva que mantener.
 *
 * **Un módulo sin cronograma se muestra igual, declarándolo.** Ocultarlo es de
 * donde vienen los 0 `class_session` de las camadas reales: un módulo
 * invisible es un módulo que nadie carga.
 */
function ModulosTab({ modules }: { modules: Module[] }) {
  if (modules.length === 0) {
    return (
      <EmptyNote title="Esta especialización todavía no tiene módulos cargados">
        Cuando la academia defina los módulos, aquí verás cada uno con su
        profesor, sus fechas y tu situación.
      </EmptyNote>
    );
  }

  return (
    <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {modules.map((m, i) => (
        <li key={m.enrollmentId}>
          <Link
            href={`/portal/cursadas/${m.enrollmentId}`}
            className="flex min-h-[64px] items-center gap-3.5 px-4 py-3 transition-colors hover:bg-accent"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold tabular-nums text-text-2">
              {/*
                El LUGAR en la lista, nunca la `position` guardada: es una clave
                de orden, y una especialización cargada 10/20/30 diría "30".
                La lista ya viene ordenada y los sin orden van al final, así
                que `i + 1` es el mismo ordinal que `modulosConOrdinal`.
              */}
              {m.position === null ? "·" : i + 1}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{m.cohortName}</span>
              <span className="block truncate text-xs text-text-3">
                {m.teacherName ?? m.courseName}
                {m.startDate && ` · ${formatDate(m.startDate)}`}
              </span>
              <span className="block truncate text-xs text-text-3">
                {m.sinCronograma
                  ? "Todavía sin cronograma cargado"
                  : `${m.completedClasses} de ${m.totalClasses} clases`}
                {m.attendancePct !== null && ` · ${m.attendancePct}% de asistencia`}
                {m.assessments.length > 0 &&
                  ` · ${m.assessments.filter((a) => a.passed === true).length}/${m.assessments.length} evaluaciones`}
              </span>
              {/* US4 — el módulo que cursa con otra camada lo dice. */}
              {m.otraCamada && (
                <ChipDeEstado tono="curso" className="mt-1.5">
                  Cursado con {m.camadaName ? `la cohorte ${m.camadaName}` : "otra cohorte"}
                </ChipDeEstado>
              )}
            </span>

            <span className="flex shrink-0 items-center gap-2">
              {m.certificate && !m.certificate.revokedAt && (
                <span className="hidden text-xs text-text-3 sm:inline">Certificado</span>
              )}
              <ApprovalBadge value={m.approval} />
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

/* ============================================================
 * Pestaña: clases
 * ============================================================ */

function ClasesTab({
  classes,
  academyZone,
  canceladas,
}: {
  classes: ClassRow[];
  academyZone: string;
  canceladas: number;
}) {
  if (classes.length === 0) {
    return (
      <EmptyNote title="Este curso aún no tiene cronograma">
        Una vez publicado, aquí verás cada clase, su tema y tu asistencia.
      </EmptyNote>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {classes.map((c) => (
          <ClassRowItem key={c.id ?? c.number} row={c} academyZone={academyZone} />
        ))}
      </ul>
      {canceladas > 0 && (
        <p className="text-xs text-text-3">
          Las clases canceladas no cuentan para tu porcentaje de asistencia.
        </p>
      )}
    </div>
  );
}

function ClassRowItem({ row, academyZone }: { row: ClassRow; academyZone: string }) {
  const marca = row.attendance ? ASISTENCIA[row.attendance] : null;

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3",
        row.canceled && "bg-subtle"
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold tabular-nums text-text-2">
        {row.number}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">
          {formatDate(row.date)}
          {row.topic && <span className="font-normal text-text-2"> · {row.topic}</span>}
        </span>
        <span className="block text-xs text-text-3">
          {row.canceled ? (
            <>Clase cancelada{row.cancelReason && ` — ${row.cancelReason}`}</>
          ) : (
            <ClassTime
              startsAt={row.startsAt}
              endsAt={row.endsAt}
              academyZone={academyZone}
            />
          )}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-2">
        {/* FR-005e — una clase cancelada no ofrece grabación aunque la tenga. */}
        {row.recordingUrl && (
          <a
            href={row.recordingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input px-3 text-sm font-semibold transition-colors hover:bg-accent"
          >
            <Play className="h-3.5 w-3.5" strokeWidth={2} />
            Grabación
          </a>
        )}
        {row.meetingUrl && (
          <a
            href={row.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-brand-hover"
          >
            <Video className="h-3.5 w-3.5" strokeWidth={2} />
            Ingresar
          </a>
        )}
        {marca && (
          <ChipDeEstado tono={marca.tone}>
            <marca.Icon className="h-3 w-3" strokeWidth={2.5} />
            {marca.label}
          </ChipDeEstado>
        )}
        {!marca && !row.canceled && (
          <span className="text-xs font-medium text-text-3">
            Sin registrar
          </span>
        )}
      </span>
    </li>
  );
}

/* ============================================================
 * Pestaña: material
 * ============================================================
 * 016 — La pestaña de evaluaciones se mudó entera a
 * `student-submissions.tsx`: dejó de ser una lista de estados y pasó a ser el
 * lugar donde se entrega, se lee la devolución y se vuelve a entregar. El
 * badge de aprobada/desaprobada sigue saliendo del resultado de la evaluación
 * (010) y no de la entrega, porque la academia puede corregir por fuera.
 */

function MaterialTab({
  resources,
}: {
  resources: { id: string; title: string; url: string; kind: string }[];
}) {
  if (resources.length === 0) {
    return (
      <EmptyNote title="Todavía no hay material publicado">
        Aquí se publicarán las guías, ejemplos y enlaces que compartan la
        academia o tu profesor.
      </EmptyNote>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {resources.map((r) => (
        <li key={r.id}>
          <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[52px] items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-accent"
          >
            <FileText className="h-4 w-4 shrink-0 text-text-3" strokeWidth={1.7} />
            <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
            <span className="shrink-0 text-xs uppercase text-text-3">{r.kind}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/* ============================================================
 * Pestaña: avisos
 * ============================================================ */

function AvisosTab({
  announcements,
}: {
  announcements: {
    id: string;
    title: string;
    body: string;
    authorName: string | null;
    createdAt: string;
  }[];
}) {
  if (announcements.length === 0) {
    return (
      <EmptyNote title="No hay avisos para tu cohorte">
        Los avisos de la academia o de tu profesor se publicarán aquí, con su
        autor y fecha.
      </EmptyNote>
    );
  }

  return (
    <div className="space-y-3">
      {announcements.map((a) => (
        <PortalCard key={a.id}>
          <div className="flex items-start gap-3">
            <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-text-3" strokeWidth={1.7} />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{a.title}</p>
              <p className="mt-1 whitespace-pre-line text-sm text-text-2">{a.body}</p>
              <p className="mt-2 text-xs text-text-3">
                {a.authorName ?? "La academia"} · {formatDate(a.createdAt)}
              </p>
            </div>
          </div>
        </PortalCard>
      ))}
    </div>
  );
}

/* ============================================================ */

function CertificateCard({
  cert,
}: {
  cert: { code: string; issuedAt: string; revokedAt: string | null };
}) {
  return (
    <Tarjeta as="article" className="space-y-4 border-brand-soft bg-brand-tint">
      <div>
        <p className="text-lg font-semibold tracking-tight">Tu certificado</p>
        <p className="mt-1 text-sm text-text-2">Emitido el {formatDate(cert.issuedAt)}</p>
        <p className="text-xs text-text-3">
          Código <span className="font-mono">{cert.code}</span>
        </p>
      </div>
      <Link
        href={`/verificar/${cert.code}`}
        className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Ver y compartir
      </Link>
    </Tarjeta>
  );
}

function Volver() {
  return (
    <Link
      href="/portal"
      className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground md:min-h-0"
    >
      <ArrowLeft className="h-4 w-4" strokeWidth={1.7} />
      Inicio
    </Link>
  );
}
