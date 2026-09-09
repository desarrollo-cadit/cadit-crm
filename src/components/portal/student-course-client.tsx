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
import { Progress } from "@/components/ui/progress";
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
  assessments: { name: string; required: boolean; passed: boolean | null }[];
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
    assessments: { name: string; required: boolean; passed: boolean | null }[];
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

const ASISTENCIA: Record<
  AttendanceStatus,
  { label: string; className: string; Icon: typeof Check }
> = {
  presente: {
    label: "Viniste",
    className: "border-success-border bg-success-soft text-success",
    Icon: Check,
  },
  tarde: {
    label: "Llegaste tarde",
    className: "border-success-border bg-success-soft text-success",
    Icon: Clock,
  },
  ausente: {
    label: "Faltaste",
    className: "border-danger-border bg-danger-soft text-danger",
    Icon: X,
  },
  justificado: {
    label: "Falta justificada",
    className: "border-warning-border bg-warning-soft text-warning",
    Icon: Minus,
  },
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
            ? "No encontramos esta cursada en tu ficha."
            : "No pudimos cargar la cursada. Probá de nuevo en un momento."
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
    <div className="space-y-7">
      <div className="space-y-3">
        <Volver />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{course.courseName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {course.cohortName}
              {course.teacherName && ` · ${course.teacherName}`}
            </p>
          </div>
          <ApprovalBadge value={course.approval} />
        </div>
        <p className="text-sm text-text-3">
          {formatDate(course.startDate)}
          {course.endDate && ` – ${formatDate(course.endDate)}`}
          {course.frequency && ` · ${course.frequency}`}
          {course.classroom && ` · ${course.classroom}`}
        </p>
      </div>

      {/*
        024 — El recorrido va PRIMERO en celular y al costado en escritorio.
        Es contexto permanente, no una sección que se lee una vez y se deja
        atrás — y en el teléfono, al final, quedaba después de doce clases de
        scroll.
      */}
      <div className="grid gap-5 lg:grid-cols-[1fr_21rem] lg:items-start">
        <div className="order-2 min-w-0 space-y-5 lg:order-1">
          {modulos.length > 0 ? (
            <ProgramCard course={course} modules={modulos} />
          ) : (
            <ProgressCard course={course} />
          )}

          <div>
            <div
              role="tablist"
              aria-label="Secciones de la cursada"
              className="flex gap-1 overflow-x-auto border-b border-border"
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
                    "relative flex min-h-[44px] shrink-0 items-center gap-2 px-3.5 text-sm font-medium transition-colors",
                    activa === p.key
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {p.label}
                  {p.count !== null && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums",
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
                <EvaluacionesTab assessments={course.assessments} />
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

function ProgressCard({ course }: { course: Detail["course"] }) {
  const avance =
    course.totalClasses > 0
      ? Math.round((course.completedClasses / course.totalClasses) * 100)
      : null;
  const alcanza =
    course.attendancePct === null ||
    course.minAttendancePct === null ||
    course.attendancePct >= course.minAttendancePct;

  return (
    <PortalCard className="space-y-5">
      {avance !== null && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium">
              Clase {course.completedClasses} de {course.totalClasses}
            </p>
            <p className="text-xs text-text-3">
              {course.completedClasses >= course.totalClasses
                ? "cursada completa"
                : `faltan ${course.totalClasses - course.completedClasses}`}
            </p>
          </div>
          <Progress value={avance} label={`Avance del curso, ${avance}%`} />
        </div>
      )}

      <div className="space-y-2 border-t border-border pt-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium">Mi asistencia</p>
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
            Todavía no se registró asistencia en esta cursada.
          </p>
        ) : (
          <>
            <p
              className={cn(
                "text-2xl font-semibold tabular-nums",
                !alcanza && "text-danger"
              )}
            >
              {course.attendancePct}%
            </p>
            <Progress
              value={course.attendancePct}
              marker={course.minAttendancePct}
              tone={alcanza ? "success" : "danger"}
              label={`Asistencia ${course.attendancePct}%`}
            />
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
  const avance = Math.round((aprobados / modules.length) * 100);

  return (
    <PortalCard className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium">
            {aprobados} de {modules.length} módulos aprobados
          </p>
          <p className="text-xs text-text-3">
            {aprobados >= modules.length
              ? "especialización completa"
              : `faltan ${modules.length - aprobados}`}
          </p>
        </div>
        <Progress value={avance} label={`Avance de la especialización, ${avance}%`} />
      </div>

      <p className="text-xs text-text-3">
        La asistencia y la aprobación son por módulo: entrá a cada uno para ver
        sus clases y sus evaluaciones.
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
        Cuando la academia arme los módulos vas a ver acá cada uno con su
        profesor, sus fechas y tu estado.
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
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold tabular-nums text-text-2">
              {m.position ?? i + 1}
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
                <span className="mt-1 inline-flex items-center rounded-full border border-warning-border bg-warning-soft px-2 py-0.5 text-[10.5px] font-medium text-warning">
                  Lo cursás con {m.camadaName ?? "otra camada"}
                </span>
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
      <EmptyNote title="Esta cursada todavía no tiene cronograma">
        Cuando la academia lo genere vas a ver acá cada clase, su tema y tu
        asistencia.
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
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold tabular-nums text-text-2">
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
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input px-2.5 text-xs font-medium transition-colors hover:bg-accent"
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
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-2.5 text-xs font-semibold text-on-accent transition-colors hover:bg-brand-hover"
          >
            <Video className="h-3.5 w-3.5" strokeWidth={2} />
            Entrar
          </a>
        )}
        {marca && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
              marca.className
            )}
          >
            <marca.Icon className="h-3 w-3" strokeWidth={2.5} />
            {marca.label}
          </span>
        )}
        {!marca && !row.canceled && (
          <span className="text-xs text-text-3">Sin registrar</span>
        )}
      </span>
    </li>
  );
}

/* ============================================================
 * Pestaña: evaluaciones
 * ============================================================ */

function EvaluacionesTab({
  assessments,
}: {
  assessments: { name: string; required: boolean; passed: boolean | null }[];
}) {
  if (assessments.length === 0) {
    return (
      <EmptyNote title="Esta cursada todavía no tiene evaluaciones cargadas">
        Cuando la academia las cargue vas a ver acá cuáles aprobaste y cuáles
        faltan corregir.
      </EmptyNote>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {assessments.map((a) => (
        <li key={a.name} className="flex items-center justify-between gap-3 px-4 py-3.5">
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{a.name}</span>
            {!a.required && <span className="text-xs text-text-3">No obligatoria</span>}
          </span>
          {/*
            FR-005 — sin corregir se muestra PENDIENTE, jamás desaprobada.
            Marcar como reprobado a quien todavía no fue evaluado es acusarlo
            de algo que no pasó.
          */}
          {a.passed === null ? (
            <span className="shrink-0 rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-medium text-text-2">
              Sin corregir
            </span>
          ) : a.passed ? (
            <span className="shrink-0 rounded-full border border-success-border bg-success-soft px-2.5 py-0.5 text-xs font-medium text-success">
              Aprobada
            </span>
          ) : (
            <span className="shrink-0 rounded-full border border-danger-border bg-danger-soft px-2.5 py-0.5 text-xs font-medium text-danger">
              Desaprobada
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ============================================================
 * Pestaña: material
 * ============================================================ */

function MaterialTab({
  resources,
}: {
  resources: { id: string; title: string; url: string; kind: string }[];
}) {
  if (resources.length === 0) {
    return (
      <EmptyNote title="Todavía no hay material publicado">
        Las guías, ejemplos y enlaces que suba la academia o tu profesor
        aparecen acá.
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
      <EmptyNote title="No hay avisos de la camada">
        Cuando la academia o tu profesor publiquen uno, lo vas a ver acá con su
        autor y su fecha.
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
    <PortalCard className="space-y-3">
      <p className="text-[13px] font-semibold tracking-tight text-text-2">
        Tu certificado
      </p>
      <div>
        <p className="text-sm font-medium">Emitido el {formatDate(cert.issuedAt)}</p>
        <p className="text-xs text-text-3">
          Código <span className="font-mono">{cert.code}</span>
        </p>
      </div>
      <Link
        href={`/verificar/${cert.code}`}
        className="inline-flex h-10 w-full items-center justify-center rounded-md border border-input px-4 text-sm font-medium transition-colors hover:bg-accent"
      >
        Ver y compartir
      </Link>
    </PortalCard>
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
