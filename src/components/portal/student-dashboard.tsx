"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Award,
  CalendarClock,
  ChevronRight,
  CircleAlert,
  KeyRound,
  MapPin,
  UserRound,
  Video,
  Wallet,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatAmount } from "@/lib/utils";
import {
  ApprovalBadge,
  ClassTime,
  EmptyNote,
  PortalCard,
  formatDate,
  formatDay,
  relativeDay,
  useViewerTimeZone,
} from "@/components/portal/student-bits";
import type { ApprovalValue } from "@/components/portal/student-bits";

/**
 * 015/023 — El inicio del alumno.
 *
 * Ordenado por la frecuencia REAL de las preguntas que hoy llegan por
 * WhatsApp, no por la estructura de la base: cuándo es la próxima clase y cuál
 * es el link, si estoy en problemas, cómo voy, qué licencia tengo, cuánto
 * debo, dónde está mi certificado.
 *
 * 023 — La primera versión listaba datos correctos en cajas iguales, y se leía
 * como un formulario: nada decía que la cursada AVANZA. Los cambios de esta
 * pasada son eso, no maquillaje:
 *
 *  - La próxima clase deja de ser una tarjeta más y pasa a ser la pantalla:
 *    es la pregunta que más veces por semana interrumpe a coordinación.
 *  - Cada cursada muestra **clase N de M** con su barra. La asistencia
 *    responde "¿voy bien?"; el avance responde "¿cuánto me falta?", y sin el
 *    segundo el portal no transmite movimiento.
 *  - Los números viven DENTRO de la cursada que describen, no en una fila de
 *    métricas sueltas arriba: un porcentaje sin su curso al lado obliga a
 *    recordar de cuál era.
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
        setError("No pudimos cargar tu información. Probá de nuevo en un momento.");
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
  const certificados = data.courses
    .map((c) => (c.certificate ? { curso: c.courseName, ...c.certificate } : null))
    .filter((c): c is NonNullable<Course["certificate"]> & { curso: string } => c !== null);

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Hola, {nombreCorto}</h1>
        <p className="text-[15px] text-muted-foreground">
          {activos.length > 0
            ? `Estás cursando ${activos.length} ${activos.length === 1 ? "curso" : "cursos"}.`
            : "No tenés cursos en marcha ahora mismo."}
        </p>
      </header>

      <NextClassHero next={data.nextClass} academyZone={data.timezone} />

      <Alertas courses={data.courses} balances={data.balances} />

      {activos.length > 0 && (
        <Section title="Mis cursos">
          {/*
            Una sola cursada ocupa el ancho. En dos columnas quedaba una
            tarjeta a media página con un hueco al lado, que se lee como algo
            que falta cargar — y la mayoría de los 340 tiene una sola.
          */}
          <div className={cn("grid gap-4", activos.length > 1 && "lg:grid-cols-2")}>
            {activos.map((c) => (
              <CourseCard key={c.enrollmentId} course={c} />
            ))}
          </div>
        </Section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <BalanceCard balances={data.balances} />
        {licencias.length > 0 && <LicenseCard license={licencias[0]!} extra={licencias.length - 1} />}
      </div>

      {certificados.length > 0 && (
        <Section title="Mis certificados">
          <div className="grid gap-3 sm:grid-cols-2">
            {certificados.map((c) => (
              <CertificateCard key={c.code} cert={c} />
            ))}
          </div>
        </Section>
      )}

      {cerrados.length > 0 && (
        <Section title={`Ya cursados (${cerrados.length})`}>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {cerrados.map((c) => (
              <li key={c.enrollmentId}>
                <Link
                  href={`/portal/cursadas/${c.enrollmentId}`}
                  className="flex min-h-[56px] items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {c.courseName}
                    </span>
                    <span className="block truncate text-xs text-text-3">
                      {formatDate(c.startDate)}
                      {c.endDate && ` – ${formatDate(c.endDate)}`}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <ApprovalBadge value={c.approval} />
                    <ChevronRight className="h-4 w-4 text-text-4" strokeWidth={1.7} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.courses.length === 0 && (
        <EmptyNote title="Todavía no tenés ninguna inscripción">
          Cuando la academia te inscriba en un curso, lo vas a ver acá con sus
          fechas, tu asistencia y tu estado de cuenta.
        </EmptyNote>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3.5">
      <h2 className="text-[13px] font-semibold tracking-tight text-text-2">{title}</h2>
      {children}
    </section>
  );
}

/* ============================================================
 * US2 — La próxima clase: la pantalla, no una tarjeta más
 * ============================================================ */

/**
 * "¿Cuál era el link del Zoom?" es la pregunta que más veces por semana
 * interrumpe a coordinación, así que ocupa el lugar que le corresponde.
 *
 * El enlace aparece SOLO dentro de la ventana de la organización (FR-003 de
 * 013): 15 minutos antes, 30 después. Cuando no está, la pantalla dice CUÁNDO
 * va a estar en vez de dejar un botón muerto — un enlace visible todo el día
 * invita a entrar a una sala vacía.
 */
function NextClassHero({
  next,
  academyZone,
}: {
  next: NextClass | null;
  academyZone: string;
}) {
  const viewerZone = useViewerTimeZone() ?? academyZone;

  if (!next) {
    return (
      <PortalCard className="flex items-start gap-3.5">
        <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-text-3" strokeWidth={1.7} />
        <div>
          <p className="font-medium">No tenés clases próximas</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cuando la academia cargue el cronograma de tu camada, tu próxima
            clase y su enlace aparecen acá.
          </p>
        </div>
      </PortalCard>
    );
  }

  const cuando = next.startsAt ?? next.date;

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-lg border shadow-md",
        next.live ? "border-brand bg-brand-soft" : "border-brand-soft bg-brand-tint"
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-6 p-6 sm:p-7">
        <div className="min-w-0 space-y-2.5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-text">
            {next.live && (
              // El único momento animado de la pantalla, y solo cuando la
              // clase está pasando de verdad.
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
              </span>
            )}
            {next.live ? "Tu clase está pasando" : "Tu próxima clase"}
          </p>

          <p className="text-2xl font-semibold leading-tight tracking-tight">
            {next.courseName}
          </p>

          <p className="text-[15px] text-text-2 first-letter:uppercase">
            <span className="font-medium">{formatDay(cuando, viewerZone)}</span>
            {" · "}
            <ClassTime
              startsAt={next.startsAt}
              endsAt={next.endsAt}
              academyZone={academyZone}
            />
          </p>

          {next.topic && (
            <p className="text-sm text-muted-foreground">
              Clase {next.number}: {next.topic}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-xs text-text-3">
            <span className="rounded-full border border-brand-soft bg-background px-2.5 py-1 font-medium text-brand-text">
              {next.live ? "en curso" : relativeDay(cuando, viewerZone)}
            </span>
            {next.teacherName && (
              <span className="inline-flex items-center gap-1.5">
                <UserRound className="h-3.5 w-3.5" strokeWidth={1.7} />
                {next.teacherName}
              </span>
            )}
            {next.classroom && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" strokeWidth={1.7} />
                {next.classroom}
              </span>
            )}
          </div>
        </div>

        {next.meetingUrl ? (
          <a
            href={next.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-md bg-brand px-6 text-sm font-semibold text-on-accent shadow-sm transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Video className="h-4 w-4" strokeWidth={2} />
            Entrar a la clase
          </a>
        ) : (
          <p className="inline-flex shrink-0 items-center gap-2 text-xs text-text-3">
            <Video className="h-4 w-4 shrink-0" strokeWidth={1.7} />
            El enlace se abre unos minutos antes
          </p>
        )}
      </div>
    </section>
  );
}

/* ============================================================
 * Lo que necesita atención — y solo cuando lo necesita
 * ============================================================ */

/**
 * Las alertas aparecen cuando son ciertas y desaparecen cuando no. Un panel
 * fijo que dice "todo en orden" deja de leerse a la tercera visita, y entonces
 * el día que diga algo real tampoco se va a leer.
 */
function Alertas({ courses, balances }: { courses: Course[]; balances: Balance[] }) {
  const avisos: { key: string; text: string; href?: string }[] = [];

  for (const c of courses) {
    if (c.status === "finalizada") continue;
    if (
      c.attendancePct !== null &&
      c.minAttendancePct !== null &&
      c.attendancePct < c.minAttendancePct
    ) {
      avisos.push({
        key: `asis-${c.enrollmentId}`,
        text: `En ${c.courseName} vas ${c.attendancePct}% de asistencia y el mínimo para aprobar es ${c.minAttendancePct}%.`,
        href: `/portal/cursadas/${c.enrollmentId}`,
      });
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
          className="flex items-start gap-3 rounded-lg border border-warning-border bg-warning-soft px-4 py-3.5"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" strokeWidth={2} />
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
 * US1, US3, US4 — Cómo voy en cada curso
 * ============================================================ */

function CourseCard({ course }: { course: Course }) {
  const obligatorias = course.assessments.filter((a) => a.required);
  const aprobadas = obligatorias.filter((a) => a.passed === true).length;
  const pendientes = obligatorias.filter((a) => a.passed === null).length;

  const avance =
    course.totalClasses > 0
      ? Math.round((course.completedClasses / course.totalClasses) * 100)
      : null;

  const alcanzaMinimo =
    course.attendancePct === null ||
    course.minAttendancePct === null ||
    course.attendancePct >= course.minAttendancePct;

  return (
    <Link
      href={`/portal/cursadas/${course.enrollmentId}`}
      className="group flex flex-col rounded-lg border border-border bg-card p-[var(--portal-card-pad)] shadow-sm transition-colors hover:border-brand-soft hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold tracking-tight">{course.courseName}</p>
          <p className="mt-0.5 truncate text-sm text-text-3">
            {course.teacherName ?? course.cohortName}
          </p>
        </div>
        <ApprovalBadge value={course.approval} />
      </div>

      {/*
        023 — El AVANCE, que es lo que faltaba. La asistencia dice "¿voy
        bien?"; esto dice "¿cuánto me falta?", y es lo que convierte una lista
        de datos en una cursada que se mueve.
      */}
      {avance !== null && (
        <div className="mt-5 space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium">
              Clase {course.completedClasses} de {course.totalClasses}
            </span>
            <span className="text-xs text-text-3">
              {course.completedClasses >= course.totalClasses
                ? "cursada completa"
                : `faltan ${course.totalClasses - course.completedClasses}`}
            </span>
          </div>
          <Progress value={avance} label={`Avance del curso, ${avance}%`} />
        </div>
      )}

      {/*
        Flex y no grid: en una tarjeta a ancho completo, dos columnas de grilla
        estiran los números hasta 600px cada una y el segundo queda flotando en
        el medio de la nada. Así se agrupan y se leen como un par.
      */}
      <div className="mt-5 flex flex-wrap gap-x-12 gap-y-4 border-t border-border pt-4">
        <div className="min-w-[8rem]">
          <p className="text-xs text-text-3">Asistencia</p>
          {course.attendancePct === null ? (
            <p className="mt-0.5 text-sm text-text-3">Sin registrar</p>
          ) : (
            <>
              <p
                className={cn(
                  "mt-0.5 text-xl font-semibold tabular-nums",
                  !alcanzaMinimo && "text-danger"
                )}
              >
                {course.attendancePct}%
              </p>
              <p className="text-xs text-text-3">
                {course.attendedCount} de {course.eligibleCount}
                {course.minAttendancePct !== null && ` · mín. ${course.minAttendancePct}%`}
              </p>
            </>
          )}
        </div>

        <div className="min-w-[8rem]">
          <p className="text-xs text-text-3">Evaluaciones</p>
          {obligatorias.length === 0 ? (
            <p className="mt-0.5 text-sm text-text-3">Sin cargar</p>
          ) : (
            <>
              <p className="mt-0.5 text-xl font-semibold tabular-nums">
                {aprobadas}
                <span className="text-sm font-normal text-text-3">
                  /{obligatorias.length}
                </span>
              </p>
              {/* FR-005 — sin corregir es PENDIENTE, jamás desaprobada. */}
              <p className="text-xs text-text-3">
                {pendientes > 0 ? `${pendientes} sin corregir` : "todo corregido"}
              </p>
            </>
          )}
        </div>
      </div>

      {course.approval === "sin_datos" && (
        <p className="mt-4 text-sm text-text-3">{course.approvalReasons[0]}</p>
      )}

      <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-brand-text">
        Ver la cursada
        <ChevronRight
          className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
          strokeWidth={2}
        />
      </span>
    </Link>
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
      <PortalCard className="flex items-start gap-3.5">
        <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-text-3" strokeWidth={1.7} />
        <div>
          <p className="font-medium">Sin movimientos de cuenta</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cuando la academia genere tu plan de cuotas vas a ver acá qué
            pagaste y qué falta.
          </p>
        </div>
      </PortalCard>
    );
  }

  return (
    <PortalCard className="flex flex-col">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold tracking-tight text-text-2">Mi cuenta</p>
        <Link
          href="/portal/cuenta"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-text underline-offset-4 hover:underline"
        >
          Cuotas y pagos
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
        </Link>
      </div>

      <div className="mt-4 space-y-5">
        {balances.map((b) => {
          const pagadoPct = b.total > 0 ? Math.round((b.paid / b.total) * 100) : 0;
          return (
            <div key={b.currency} className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <p
                  className={cn(
                    "text-2xl font-semibold tabular-nums",
                    b.overdueCount > 0 && "text-danger"
                  )}
                >
                  {formatAmount(b.balance, b.currency)}
                </p>
                <p className="text-xs text-text-3">
                  {balances.length > 1 && `${b.currency} · `}
                  {b.balance === 0 ? "al día" : "por pagar"}
                </p>
              </div>

              <Progress
                value={pagadoPct}
                tone={b.overdueCount > 0 ? "danger" : "success"}
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
      </div>
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
    <PortalCard className="flex flex-col">
      <p className="text-[13px] font-semibold tracking-tight text-text-2">Mi licencia</p>

      <div className="mt-4 flex items-start gap-3.5">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
            license.assigned ? "bg-brand-soft text-brand-text" : "bg-secondary text-text-3"
          )}
        >
          <KeyRound className="h-5 w-5" strokeWidth={1.7} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold tracking-tight">{license.softwareName}</p>
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
              En trámite. Cuando la academia te la asigne vas a ver acá desde
              cuándo y hasta cuándo la tenés.
            </p>
          )}

          {extra > 0 && (
            <p className="mt-2 text-xs text-text-3">
              y {extra} {extra === 1 ? "licencia más" : "licencias más"} en tus otras
              cursadas
            </p>
          )}
        </div>
      </div>
    </PortalCard>
  );
}

/* ============================================================
 * US6 — Mi certificado
 * ============================================================ */

function CertificateCard({
  cert,
}: {
  cert: { code: string; issuedAt: string; revokedAt: string | null; curso: string };
}) {
  const anulado = cert.revokedAt !== null;

  return (
    <PortalCard className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3.5">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
            anulado ? "bg-secondary text-text-4" : "bg-brand-soft text-brand-text"
          )}
        >
          <Award className="h-5 w-5" strokeWidth={1.7} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{cert.curso}</p>
          <p className="truncate text-xs text-text-3">
            {formatDate(cert.issuedAt)} · <span className="font-mono">{cert.code}</span>
          </p>
        </div>
      </div>

      {/* FR-009 — un certificado anulado se ve, pero no se ofrece. */}
      {anulado ? (
        <span className="shrink-0 text-xs font-medium text-danger">Anulado</span>
      ) : (
        <Link
          href={`/verificar/${cert.code}`}
          className="inline-flex h-9 shrink-0 items-center rounded-md border border-input px-3 text-xs font-medium transition-colors hover:bg-accent"
        >
          Compartir
        </Link>
      )}
    </PortalCard>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-5 w-40" />
      </div>
      <Skeleton className="h-44 w-full rounded-lg" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56 w-full rounded-lg" />
        <Skeleton className="h-56 w-full rounded-lg" />
      </div>
    </div>
  );
}
