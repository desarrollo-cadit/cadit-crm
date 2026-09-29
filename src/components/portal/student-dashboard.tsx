"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight, CircleAlert, KeyRound, Video, Wallet } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatAmount } from "@/lib/utils";
import {
  ApprovalBadge,
  EmptyNote,
  PortalCard,
  formatDate,
  formatDay,
  formatHour,
  relativeDay,
  useViewerTimeZone,
  zoneLabel,
} from "@/components/portal/student-bits";
import type { ApprovalValue } from "@/components/portal/student-bits";
import { CadenaDeCotas, Lamina, Rotulo, Sello, TituloDeVista } from "@/components/portal/plano";

/**
 * 015/023 — El inicio del alumno.
 *
 * Ordenado por la frecuencia REAL de las preguntas que hoy llegan por
 * WhatsApp, no por la estructura de la base: cuándo es la próxima clase y cuál
 * es el link, si estoy en problemas, cómo voy, qué licencia tengo, cuánto
 * debo, dónde está mi certificado.
 *
 * 023 — La primera versión listaba datos correctos en cajas iguales, y se leía
 * como un formulario: nada decía que la cursada AVANZA.
 *
 * Mundo "Cianotipo de obra" — La próxima clase y el avance de su cursada
 * dejan de ser dos tarjetas: son UNA lámina. La mayoría de los alumnos tiene
 * una sola cursada, y con dos tarjetas veía el mismo curso dos veces —una
 * para "cuándo" y otra para "cómo voy"—. La lámina responde las dos cosas en
 * el orden en que se preguntan. Las demás cursadas en marcha tienen cada una
 * su propia lámina, más chica.
 */

type Assessment = { name: string; required: boolean; passed: boolean | null };

type License = {
  softwareName: string;
  assigned: boolean;
  assignedAt: string | null;
  expiresAt: string | null;
  daysLeft: number | null;
};

type Course = {
  enrollmentId: string;
  cohortId: string | null;
  cohortName: string;
  courseName: string;
  status: "planificada" | "en_curso" | "finalizada" | "sin_cohorte";
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
  assessments: Assessment[];
  certificate: { code: string; issuedAt: string; revokedAt: string | null } | null;
  license: License | null;
  /**
   * 028 (US3) — Los módulos de una especialización, en orden de `position`.
   * Ausente en la cursada simple, que es el caso de la enorme mayoría.
   */
  modules?: Module[];
};

/**
 * 028 — Un módulo dentro de una especialización: una cursada como cualquier
 * otra, más su posición y de qué camada la cursa.
 */
type Module = Omit<Course, "modules"> & {
  position: number | null;
  sinCronograma: boolean;
  otraCamada: boolean;
  camadaName: string | null;
};

type NextClass = {
  enrollmentId: string;
  cohortId: string;
  cohortName: string;
  courseName: string;
  number: number;
  date: string;
  startsAt: string | null;
  endsAt: string | null;
  topic: string | null;
  classroom: string | null;
  teacherName: string | null;
  meetingUrl: string | null;
  live: boolean;
};

type Balance = {
  currency: string;
  total: number;
  paid: number;
  balance: number;
  overdueCount: number;
  nextDueDate: string | null;
};

type Overview = {
  student: { name: string; email: string | null };
  timezone: string;
  nextClass: NextClass | null;
  courses: Course[];
  balances: Balance[];
};

export function StudentDashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/portal/me").catch(() => null);
      if (!res?.ok) {
        setError("No se pudo cargar tu información. Recargá la página o intentá nuevamente más tarde.");
        return;
      }
      setData((await res.json()) as Overview);
    })();
  }, []);

  if (error) {
    return (
      <PortalCard className="border-danger-border bg-danger-soft">
        <p className="text-sm text-danger">{error}</p>
      </PortalCard>
    );
  }

  if (!data) return <DashboardSkeleton />;

  const nombreCorto = data.student.name.split(/\s+/)[0] ?? data.student.name;
  const activos = data.courses.filter((c) => c.status !== "finalizada");
  const cerrados = data.courses.filter((c) => c.status === "finalizada");
  const licencias = data.courses
    .map((c) => (c.license ? { curso: c.courseName, ...c.license } : null))
    .filter((l): l is License & { curso: string } => l !== null);
  /**
   * US5 — Un certificado POR MÓDULO, y el general al final. Quien aprobó el
   * módulo 1 lo tiene sin esperar los ocho meses de la especialización, así
   * que los certificados de los módulos se listan junto con los de las
   * cursadas sueltas: son certificados suyos igual.
   */
  const certificados = data.courses
    .flatMap((c) => [
      c.certificate ? { curso: c.courseName, ...c.certificate } : null,
      ...(c.modules ?? []).map((m) =>
        m.certificate ? { curso: m.cohortName, ...m.certificate } : null
      ),
    ])
    .filter((c): c is NonNullable<Course["certificate"]> & { curso: string } => c !== null);

  /**
   * La lámina grande es la cursada de la próxima clase: es la pregunta que
   * más veces por semana interrumpe a coordinación. Sin clase en agenda, es
   * la primera cursada en marcha.
   */
  const principal =
    activos.find((c) => c.enrollmentId === data.nextClass?.enrollmentId) ?? activos[0] ?? null;
  const otros = activos.filter((c) => c.enrollmentId !== principal?.enrollmentId);
  const next = principal && data.nextClass?.enrollmentId === principal.enrollmentId ? data.nextClass : null;

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h1 className="font-display text-4xl font-semibold uppercase tracking-[0.03em] sm:text-5xl">
          Hola, {nombreCorto}
        </h1>
        <p className="text-[15px] text-text-2">
          {activos.length > 0
            ? `Estás cursando ${activos.length} ${activos.length === 1 ? "curso" : "cursos"}.`
            : "No tenés cursos activos."}
        </p>
      </header>

      {principal ? (
        <LaminaDeCursada course={principal} next={next} academyZone={data.timezone} />
      ) : (
        data.courses.length > 0 && (
          <LaminaSinCursada cursados={cerrados.length} certificados={certificados.length} />
        )
      )}

      <Alertas courses={data.courses} balances={data.balances} />

      {otros.length > 0 && (
        <section className="space-y-4">
          <TituloDeVista>{otros.length === 1 ? "Otro curso activo" : "Otros cursos activos"}</TituloDeVista>
          <div className={cn("grid gap-4", otros.length > 1 && "lg:grid-cols-2")}>
            {otros.map((c) => (
              <LaminaDeCursada key={c.enrollmentId} course={c} next={null} academyZone={data.timezone} compact />
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-x-6 gap-y-10 lg:grid-cols-2">
        <section className="flex flex-col gap-4">
          <TituloDeVista
            aside={
              data.balances.length > 0 && (
                <Link
                  href="/portal/cuenta"
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-text underline-offset-4 hover:underline"
                >
                  Cuotas y pagos
                  <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
                </Link>
              )
            }
          >
            Estado de cuenta
          </TituloDeVista>
          <BalanceCard balances={data.balances} />
        </section>
        {licencias.length > 0 && (
          <section className="flex flex-col gap-4">
            <TituloDeVista>Mi licencia</TituloDeVista>
            <LicenseCard license={licencias[0]!} extra={licencias.length - 1} />
          </section>
        )}
      </div>

      {certificados.length > 0 && (
        <section className="space-y-4">
          <TituloDeVista>Mis certificados</TituloDeVista>
          <div className="grid gap-3 sm:grid-cols-2">
            {certificados.map((c) => (
              <CertificateCard key={c.code} cert={c} />
            ))}
          </div>
        </section>
      )}

      {cerrados.length > 0 && (
        <section className="space-y-4">
          <TituloDeVista>Cursos finalizados · {cerrados.length}</TituloDeVista>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {cerrados.map((c) => (
              <li key={c.enrollmentId}>
                <Link
                  href={`/portal/cursadas/${c.enrollmentId}`}
                  className="flex min-h-[56px] items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{c.courseName}</span>
                    <span className="block truncate text-xs text-text-3">
                      {formatDate(c.startDate)}
                      {c.endDate && ` – ${formatDate(c.endDate)}`}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <ApprovalBadge value={c.approval} />
                    <ChevronRight className="h-4 w-4 text-text-4" strokeWidth={1.7} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.courses.length === 0 && (
        <EmptyNote title="No tenés inscripciones registradas">
          Cuando la academia registre tu inscripción, aquí verás las fechas del
          curso, tu asistencia y tu estado de cuenta.
        </EmptyNote>
      )}
    </div>
  );
}

/* ============================================================
 * US1–US4 — La lámina de una cursada
 * ============================================================ */

/**
 * Una cursada como lámina: arriba el curso y su sello, en el medio la próxima
 * clase (solo en la grande), abajo la cadena de cotas y el rótulo con las
 * lecturas. `compact` es la lámina de las OTRAS cursadas: misma hoja, sin la
 * próxima clase, que ya tiene su lugar arriba.
 *
 * Las lecturas viven DENTRO de la cursada que describen (023): un porcentaje
 * sin su curso al lado obliga a recordar de cuál era.
 */
function LaminaDeCursada({
  course,
  next,
  academyZone,
  compact = false,
}: {
  course: Course;
  next: NextClass | null;
  academyZone: string;
  compact?: boolean;
}) {
  const tituloId = `cursada-${course.enrollmentId}`;
  const completa = course.totalClasses > 0 && course.completedClasses >= course.totalClasses;

  return (
    <Lamina aria-labelledby={tituloId}>
      <div className={cn("space-y-7", compact ? "p-5 sm:p-6" : "p-5 sm:p-8")}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2
              id={tituloId}
              className={cn(
                "text-balance font-display font-semibold uppercase leading-[0.95] tracking-[0.02em] text-sheet-ink",
                compact ? "text-2xl sm:text-3xl" : "text-3xl sm:text-[2.75rem]"
              )}
            >
              {course.courseName}
            </h2>
            <p className="mt-2 text-sm text-sheet-ink-2">
              {[course.teacherName, course.cohortName].filter(Boolean).join(" · ")}
            </p>
          </div>
          <ApprovalBadge value={course.approval} onSheet />
        </div>

        {!compact && (
          <ProximaClase
            next={next}
            completa={completa}
            total={course.totalClasses}
            academyZone={academyZone}
          />
        )}

        <div className="space-y-4">
          <CadenaDeCotas
            total={course.totalClasses}
            done={course.completedClasses}
            next={next?.number ?? null}
          />
          <Lecturas course={course} />
          {course.modules && <ModulesList modules={course.modules} />}
          {course.approval === "sin_datos" && course.approvalReasons[0] && (
            <p className="text-sm text-sheet-ink-2">{course.approvalReasons[0]}</p>
          )}
        </div>

        <Link
          href={`/portal/cursadas/${course.enrollmentId}`}
          className="group inline-flex min-h-11 items-center gap-2 rounded-md border border-sheet-ink-3 px-4 font-display text-sm font-semibold uppercase tracking-[0.12em] text-sheet-ink transition-colors hover:border-sheet-ink hover:bg-sheet-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sheet-ink focus-visible:ring-offset-2 focus-visible:ring-offset-sheet"
        >
          Ver curso
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
        </Link>
      </div>
    </Lamina>
  );
}

/**
 * La próxima clase, a la escala que tiene la pregunta: la fecha y la hora
 * son lo más grande de la pantalla.
 *
 * El enlace aparece SOLO dentro de la ventana de la organización (FR-003 de
 * 013): 15 minutos antes, 30 después. Cuando no está, la lámina dice CUÁNDO
 * va a estar en vez de dejar un botón muerto — un enlace visible todo el día
 * invita a entrar a una sala vacía.
 */
function ProximaClase({
  next,
  completa,
  total,
  academyZone,
}: {
  next: NextClass | null;
  completa: boolean;
  total: number;
  academyZone: string;
}) {
  const viewerZone = useViewerTimeZone();
  const zona = viewerZone ?? academyZone;

  if (!next) {
    return (
      <div className="border-t border-sheet-line pt-6">
        <p className="font-display text-4xl font-semibold uppercase leading-none tracking-[0.02em] text-sheet-ink sm:text-5xl">
          {completa ? "Clases finalizadas" : "Sin clases programadas"}
        </p>
        <p className="mt-3 max-w-prose text-sm text-sheet-ink-2">
          {completa
            ? `Se dictaron las ${total} clases del cronograma. Tu asistencia figura en el resumen; los requisitos pendientes para finalizar el curso, en «Tu recorrido».`
            : total > 0
              ? // Hay cronograma, pero ninguna clase por delante tiene fecha confirmada.
                "Las próximas clases aún no tienen fecha confirmada. La fecha y el enlace de acceso se publicarán aquí."
              : "Cuando la academia publique el cronograma de tu cohorte, aquí verás la próxima clase y su enlace de acceso."}
        </p>
      </div>
    );
  }

  const cuando = next.startsAt ?? next.date;
  const distinta = viewerZone !== null && viewerZone !== academyZone;
  const hora = next.startsAt
    ? next.endsAt
      ? `${formatHour(next.startsAt, zona)}–${formatHour(next.endsAt, zona)}`
      : formatHour(next.startsAt, zona)
    : null;

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-6 border-t border-sheet-line pt-6">
      <div className="min-w-0 space-y-3">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-2 font-display text-2xl font-semibold uppercase leading-none tracking-[0.04em] text-sheet-ink sm:text-3xl">
          {next.live ? (
            <>
              <span className="relative flex h-3 w-3" aria-hidden>
                {/* El único latido de la pantalla, y solo mientras la clase pasa. */}
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-revision-sheet opacity-70" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-revision-sheet" />
              </span>
              Clase en curso
            </>
          ) : (
            <>
              <Sello tone="lamina-revision" className="text-sm">
                {relativeDay(cuando, zona)}
              </Sello>
              <span className="first-letter:uppercase">{formatDay(cuando, zona)}</span>
            </>
          )}
        </p>

        <p className="font-display text-[2.75rem] font-semibold leading-none tracking-[0.01em] tabular-nums text-sheet-ink min-[400px]:text-5xl sm:text-7xl">
          {hora ?? "Sin horario"}
        </p>

        <p className="text-sm text-sheet-ink-2">
          Clase {next.number}
          {next.topic && <>: <span className="text-sheet-ink">{next.topic}</span></>}
          {distinta && next.startsAt && (
            <span className="block text-xs">
              Hora local. En {zoneLabel(academyZone)}: {formatHour(next.startsAt, academyZone)}.
            </span>
          )}
        </p>
      </div>

      {next.meetingUrl ? (
        <a
          href={next.meetingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-14 shrink-0 items-center justify-center gap-2.5 rounded-md bg-sheet-ink px-7 font-display text-base font-bold uppercase tracking-[0.12em] text-sheet shadow-md transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sheet-ink focus-visible:ring-offset-2 focus-visible:ring-offset-sheet active:translate-y-px"
        >
          <Video className="h-5 w-5" strokeWidth={2} />
          Ingresar a la clase
        </a>
      ) : (
        <p className="inline-flex max-w-[16rem] shrink-0 items-start gap-2 text-sm text-sheet-ink-2">
          <Video className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.7} />
          El enlace de acceso se habilita 15 minutos antes del inicio.
        </p>
      )}
    </div>
  );
}

/**
 * El rótulo de la cursada. Cada lectura con su condición al lado: un 50% no
 * dice nada sin el mínimo, y "1 de 2" no dice nada sin saber que la otra
 * todavía no se corrigió.
 */
function Lecturas({ course }: { course: Course }) {
  const obligatorias = course.assessments.filter((a) => a.required);
  const aprobadas = obligatorias.filter((a) => a.passed === true).length;
  const pendientes = obligatorias.filter((a) => a.passed === null).length;
  const debajoDelMinimo =
    course.attendancePct !== null &&
    course.minAttendancePct !== null &&
    course.attendancePct < course.minAttendancePct;

  const items: React.ComponentProps<typeof Rotulo>["items"] = [
    {
      label: "Clase",
      value: course.totalClasses > 0 ? `${course.completedClasses} / ${course.totalClasses}` : "—",
      note:
        course.totalClasses === 0
          ? "sin cronograma"
          : course.completedClasses >= course.totalClasses
            ? "completa"
            : `faltan ${course.totalClasses - course.completedClasses}`,
    },
  ];

  /*
    028 (US3) — La especialización muestra sus MÓDULOS, no un par de números
    agregados. No existe "la asistencia de la especialización": cada módulo
    tiene su cronograma y su propio mínimo, y promediarlos inventaría un
    criterio que nadie decidió.
  */
  if (!course.modules) {
    items.push(
      course.attendancePct === null
        ? { label: "Asistencia", value: "—", note: "sin registrar" }
        : {
            label: "Asistencia",
            value: `${course.attendancePct}%`,
            note: (
              <>
                {course.attendedCount} de {course.eligibleCount}
                {course.minAttendancePct !== null && ` · mín. ${course.minAttendancePct}%`}
                {debajoDelMinimo && (
                  <Link
                    href={`/portal/cursadas/${course.enrollmentId}`}
                    className="mt-1 block font-medium text-revision-sheet underline underline-offset-2"
                  >
                    Por debajo del mínimo · Ver detalle
                  </Link>
                )}
              </>
            ),
            alert: debajoDelMinimo,
          },
      obligatorias.length === 0
        ? { label: "Evaluaciones", value: "—", note: "sin cargar" }
        : {
            label: "Evaluaciones",
            value: `${aprobadas} / ${obligatorias.length}`,
            // FR-005 — sin corregir es PENDIENTE, jamás desaprobada.
            note: pendientes > 0 ? `${pendientes} sin corregir` : "todas corregidas",
          }
    );
  }

  if (course.frequency || course.classroom) {
    items.push({
      label: "Aula",
      value: course.classroom ?? "—",
      note: course.frequency ?? undefined,
    });
  }

  return <Rotulo items={items} />;
}

/* ============================================================
 * 028 (US3, US4) — Los módulos de una especialización
 * ============================================================ */

/**
 * Los módulos en orden de `position`, cada uno con su estado, como la lista
 * de láminas de un juego.
 *
 * Tres reglas que no son de estilo:
 *
 * - **Un módulo sin cronograma se muestra igual, declarándolo.** Ocultarlo es
 *   de donde vienen los 0 `class_session` de las camadas reales: un módulo
 *   invisible es un módulo que nadie carga.
 * - **El módulo cursado con otra camada lo dice** (US4). Es el hecho que el
 *   ciclo existe para poder representar; esconderlo lo desperdicia.
 * - **`sin_datos` no se dibuja como aprobado.** `ApprovalBadge` ya separa los
 *   cuatro estados, y por eso se reusa en vez de inventar un cartel nuevo.
 */
function ModulesList({ modules }: { modules: Module[] }) {
  return (
    <ol className="divide-y divide-sheet-line border-y border-sheet-line">
      {modules.map((m, i) => (
        <li key={m.enrollmentId} className="flex items-center gap-3 py-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-sheet-ink-3 font-display text-sm font-semibold tabular-nums text-sheet-ink">
            {m.position ?? i + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-sheet-ink">{m.cohortName}</span>
            <span className="block truncate text-xs text-sheet-ink-2">
              {m.sinCronograma
                ? "Sin cronograma"
                : `${m.completedClasses} de ${m.totalClasses} clases`}
              {m.attendancePct !== null && ` · ${m.attendancePct}% de asistencia`}
              {m.otraCamada && ` · cursado con ${m.camadaName ? `la cohorte ${m.camadaName}` : "otra cohorte"}`}
            </span>
          </span>
          <ApprovalBadge value={m.approval} onSheet />
        </li>
      ))}
    </ol>
  );
}

/**
 * Quien ya no cursa nada no ve un hueco: ve la lámina de lo que ya hizo. Solo
 * se dicen cosas que el sistema sabe — cuántas cursadas cerró y cuántos
 * certificados tiene.
 */
function LaminaSinCursada({ cursados, certificados }: { cursados: number; certificados: number }) {
  return (
    <Lamina>
      <div className="space-y-3 p-5 sm:p-8">
        <p className="font-display text-4xl font-semibold uppercase leading-none tracking-[0.02em] text-sheet-ink sm:text-5xl">
          Sin cursos activos
        </p>
        <p className="max-w-prose text-sm text-sheet-ink-2">
          {cursados > 0 &&
            `Finalizaste ${cursados} ${cursados === 1 ? "curso" : "cursos"}${certificados > 0 ? ` y tenés ${certificados} ${certificados === 1 ? "certificado" : "certificados"}` : ""}. `}
          Cuando te inscribas en un nuevo curso, aparecerá aquí.
        </p>
      </div>
    </Lamina>
  );
}

/* ============================================================
 * Lo que necesita atención — y solo cuando lo necesita
 * ============================================================ */

/**
 * Las alertas aparecen cuando son ciertas y desaparecen cuando no. Un panel
 * fijo que dice "todo en orden" deja de leerse a la tercera visita, y entonces
 * el día que diga algo real tampoco se va a leer.
 *
 * En la hoja son notas de revisión: el rojo del mundo es justamente para esto.
 */
function Alertas({ courses, balances }: { courses: Course[]; balances: Balance[] }) {
  const avisos: { key: string; text: string; href?: string }[] = [];

  for (const c of courses) {
    if (c.status === "finalizada") continue;
    /*
      La asistencia de la cursada debajo del mínimo NO se repite acá: cada
      cursada en marcha tiene su lámina, y ahí la lectura ya va en rojo de
      revisión, junto al mínimo. Un aviso aparte decía lo mismo dos veces.
    */
    /**
     * 028 (Regla 5) — La asistencia es POR MÓDULO, así que el aviso también.
     * "Vas 40% en la especialización" no existe: existe "vas 40% en el
     * Módulo 2", que es el que hay que ir a arreglar.
     */
    for (const m of c.modules ?? []) {
      if (
        m.attendancePct !== null &&
        m.minAttendancePct !== null &&
        m.attendancePct < m.minAttendancePct
      ) {
        avisos.push({
          key: `asis-${m.enrollmentId}`,
          text: `En ${m.cohortName} tu asistencia es de ${m.attendancePct}%; el mínimo requerido para aprobar es ${m.minAttendancePct}%.`,
          href: `/portal/cursadas/${c.enrollmentId}`,
        });
      }
    }

    const lic = c.license;
    if (lic?.assigned && lic.daysLeft !== null && lic.daysLeft <= 30) {
      avisos.push({
        key: `lic-${c.enrollmentId}`,
        text:
          lic.daysLeft < 0
            ? `Tu licencia de ${lic.softwareName} venció.`
            : `Tu licencia de ${lic.softwareName} vence en ${lic.daysLeft} ${lic.daysLeft === 1 ? "día" : "días"}.`,
      });
    }
  }

  for (const b of balances) {
    if (b.overdueCount > 0) {
      avisos.push({
        key: `deuda-${b.currency}`,
        text: `Tenés ${b.overdueCount} ${b.overdueCount === 1 ? "cuota vencida" : "cuotas vencidas"} por ${formatAmount(b.balance, b.currency)}.`,
        href: "/portal/cuenta",
      });
    }
  }

  if (avisos.length === 0) return null;

  return (
    <ul className="space-y-2">
      {avisos.map((a) => (
        <li
          key={a.key}
          className="flex items-start gap-3 rounded-lg border border-danger-border bg-danger-soft px-4 py-3.5"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-revision" strokeWidth={2} />
          <p className="text-sm text-text-2">
            {a.text}
            {a.href && (
              <>
                {" "}
                <Link
                  href={a.href}
                  className="font-medium text-brand-text underline underline-offset-2"
                >
                  Ver el detalle
                </Link>
              </>
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}

/* ============================================================
 * US7 — Mi estado de cuenta
 * ============================================================ */

/**
 * DV-002 — La deuda se muestra aunque esté vencida: ocultarla no la hace
 * desaparecer, solo garantiza la llamada.
 *
 * **Nunca se suman monedas distintas** (corrección del ciclo 007).
 */
function BalanceCard({ balances }: { balances: Balance[] }) {
  if (balances.length === 0) {
    return (
      <PortalCard className="flex flex-1 items-start gap-3.5">
        <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-text-3" strokeWidth={1.7} />
        <div>
          <p className="font-medium">Sin movimientos de cuenta</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Aquí verás tus pagos y el saldo pendiente una vez que la academia
            registre tu plan de cuotas.
          </p>
        </div>
      </PortalCard>
    );
  }

  return (
    <PortalCard className="flex flex-1 flex-col space-y-5">
      {balances.map((b) => {
        const pagadoPct = b.total > 0 ? Math.round((b.paid / b.total) * 100) : 0;
        return (
          <div key={b.currency} className="space-y-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <p
                className={cn(
                  "font-display text-4xl font-semibold tabular-nums",
                  b.overdueCount > 0 && "text-danger"
                )}
              >
                {formatAmount(b.balance, b.currency)}
              </p>
              <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-text-3">
                {balances.length > 1 && `${b.currency} · `}
                {b.balance === 0 ? "al día" : "por pagar"}
              </p>
            </div>

            <Progress
              value={pagadoPct}
              tone={b.overdueCount > 0 ? "danger" : "brand"}
              label={`Pagaste el ${pagadoPct}% del total`}
            />

            <p className="text-xs text-text-3">
              Pagaste {formatAmount(b.paid, b.currency)} de{" "}
              {formatAmount(b.total, b.currency)}
              {b.overdueCount > 0 ? (
                <span className="font-medium text-danger">
                  {" · "}
                  {b.overdueCount}{" "}
                  {b.overdueCount === 1 ? "cuota vencida" : "cuotas vencidas"}
                </span>
              ) : (
                b.nextDueDate && ` · próxima el ${formatDate(b.nextDueDate)}`
              )}
            </p>
          </div>
        );
      })}
    </PortalCard>
  );
}

/* ============================================================
 * US5 — Mi licencia de Autodesk
 * ============================================================ */

/**
 * FR-010 — La licencia no es un accesorio del curso: es la herramienta con la
 * que se cursa, y es lo primero que el alumno pregunta.
 *
 * "En trámite" se dice con esas palabras y **sin fechas** cuando todavía no
 * está asignada. Una fecha inventada acá es alguien que se organiza mal.
 */
function LicenseCard({
  license,
  extra,
}: {
  license: License & { curso: string };
  extra: number;
}) {
  const vencida = license.daysLeft !== null && license.daysLeft < 0;
  const porVencer =
    license.daysLeft !== null && license.daysLeft >= 0 && license.daysLeft <= 30;

  return (
    <PortalCard className="flex flex-1 items-start gap-4">
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-md",
          license.assigned ? "bg-sheet text-sheet-ink" : "bg-secondary text-text-3"
        )}
      >
        <KeyRound className="h-5 w-5" strokeWidth={1.7} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-display text-2xl font-semibold uppercase leading-tight tracking-[0.02em]">
          {license.softwareName}
        </p>
        <p className="truncate text-xs text-text-3">para {license.curso}</p>

        {license.assigned ? (
          <p
            className={cn(
              "mt-2 text-sm text-text-2",
              (vencida || porVencer) && "font-medium text-warning"
            )}
          >
            {license.expiresAt ? (
              <>
                {vencida ? "Venció" : "Vence"} el {formatDate(license.expiresAt)}
                {porVencer &&
                  license.daysLeft !== null &&
                  ` · quedan ${license.daysLeft} ${license.daysLeft === 1 ? "día" : "días"}`}
              </>
            ) : (
              <>
                Activa
                {license.assignedAt && ` desde el ${formatDate(license.assignedAt)}`}. Sin
                fecha de vencimiento cargada.
              </>
            )}
          </p>
        ) : (
          <p className="mt-2 text-sm text-text-2">
            En trámite. Una vez asignada, aquí verás su fecha de inicio y de
            vencimiento.
          </p>
        )}

        {extra > 0 && (
          <p className="mt-2 text-xs text-text-3">
            y {extra} {extra === 1 ? "licencia más" : "licencias más"} en tus otros
            cursos
          </p>
        )}
      </div>
    </PortalCard>
  );
}

/* ============================================================
 * US6 — Mi certificado
 * ============================================================ */

/**
 * El certificado es la última lámina del juego: se muestra como hoja azul,
 * con su código de verificación como número de plano.
 */
function CertificateCard({
  cert,
}: {
  cert: { code: string; issuedAt: string; revokedAt: string | null; curso: string };
}) {
  const anulado = cert.revokedAt !== null;

  if (anulado) {
    // FR-009 — un certificado anulado se ve, pero no se ofrece.
    return (
      <PortalCard className="flex items-center justify-between gap-4 border-dashed">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text-2">{cert.curso}</p>
          <p className="truncate text-xs text-text-3">
            {formatDate(cert.issuedAt)} · <span className="font-mono">{cert.code}</span>
          </p>
        </div>
        <Sello tone="revision">Anulado</Sello>
      </PortalCard>
    );
  }

  return (
    <Lamina as="article" className="shadow-sm">
      <div className="flex items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="truncate font-display text-xl font-semibold uppercase tracking-[0.02em] text-sheet-ink">
            {cert.curso}
          </p>
          <p className="truncate text-xs text-sheet-ink-2">
            {formatDate(cert.issuedAt)} · <span className="font-mono">{cert.code}</span>
          </p>
        </div>
        <Link
          href={`/verificar/${cert.code}`}
          className="inline-flex min-h-11 shrink-0 items-center rounded-md border border-sheet-ink-3 px-4 font-display text-sm font-semibold uppercase tracking-[0.12em] text-sheet-ink transition-colors hover:border-sheet-ink hover:bg-sheet-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sheet-ink"
        >
          Ver y compartir
        </Link>
      </div>
    </Lamina>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-10">
      <Skeleton className="h-12 w-72" />
      <div className="lamina h-[26rem] w-full rounded-lg opacity-80" aria-hidden />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-44 w-full rounded-lg" />
        <Skeleton className="h-44 w-full rounded-lg" />
      </div>
    </div>
  );
}
