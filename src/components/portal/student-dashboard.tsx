"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Award,
  BadgeCheck,
  CalendarClock,
  CircleAlert,
  KeyRound,
  MapPin,
  UserRound,
  Video,
  Wallet,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatAmount } from "@/lib/utils";
import {
  ApprovalBadge,
  AttendanceBar,
  ClassTime,
  EmptyNote,
  PortalCard,
  SectionTitle,
  formatDate,
  formatDay,
  relativeDay,
  useViewerTimeZone,
} from "@/components/portal/student-bits";
import type { ApprovalValue } from "@/components/portal/student-bits";

/**
 * 015 — El inicio del alumno.
 *
 * La pantalla está ordenada por la frecuencia REAL de las preguntas que hoy
 * llegan por WhatsApp, no por la estructura de la base:
 *
 *   1. ¿cuándo es la próxima clase y cuál es el link?  → arriba, siempre
 *   2. ¿estoy en problemas?                            → solo si lo está
 *   3. ¿cómo voy en cada curso?                        → asistencia y notas
 *   4. ¿qué licencia tengo?                            → con su vencimiento
 *   5. ¿cuánto debo?                                   → por moneda
 *   6. ¿dónde está mi certificado?                     → al final
 *
 * El alumno entra tres minutos, dos veces por semana, casi siempre desde el
 * celular y casi siempre con UNA pregunta. Obligarlo a navegar para
 * encontrarla es devolverle el problema que vino a resolver.
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
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Hola, {nombreCorto}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {activos.length > 0
            ? `Estás cursando ${activos.length} ${activos.length === 1 ? "curso" : "cursos"}.`
            : "No tenés cursos en marcha ahora mismo."}
        </p>
      </header>

      <NextClassPanel next={data.nextClass} academyZone={data.timezone} />

      <Alertas courses={data.courses} balances={data.balances} />

      {activos.length > 0 && (
        <section className="space-y-3">
          <SectionTitle>Cómo voy</SectionTitle>
          <div className="space-y-3">
            {activos.map((c) => (
              <CourseCard key={c.enrollmentId} course={c} />
            ))}
          </div>
        </section>
      )}

      {licencias.length > 0 && (
        <section className="space-y-3">
          <SectionTitle>Mi licencia</SectionTitle>
          <div className="space-y-3">
            {licencias.map((l) => (
              <LicenseCard key={`${l.curso}-${l.softwareName}`} license={l} />
            ))}
          </div>
        </section>
      )}

      <BalancePanel balances={data.balances} />

      {certificados.length > 0 && (
        <section className="space-y-3">
          <SectionTitle>Mis certificados</SectionTitle>
          <div className="space-y-2">
            {certificados.map((c) => (
              <CertificateRow key={c.code} cert={c} />
            ))}
          </div>
        </section>
      )}

      {cerrados.length > 0 && (
        <section className="space-y-3">
          <SectionTitle>Ya cursados ({cerrados.length})</SectionTitle>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {cerrados.map((c) => (
              <li key={c.enrollmentId}>
                <Link
                  href={`/portal/cursadas/${c.enrollmentId}`}
                  className="flex min-h-[52px] items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent"
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
                  <ApprovalBadge value={c.approval} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
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

/* ============================================================
 * US2 — La próxima clase, con su enlace
 * ============================================================ */

/**
 * El bloque más importante de la pantalla, y el que justifica el portal
 * entero: "¿cuál era el link del Zoom?" es la pregunta que más veces por
 * semana interrumpe a coordinación.
 *
 * El enlace aparece SOLO dentro de la ventana de la organización (FR-003 de
 * 013) — 15 minutos antes, 30 después. Cuando no está, la pantalla dice
 * CUÁNDO va a estar en vez de mostrar un botón muerto: un enlace visible todo
 * el día invita a entrar a una sala vacía.
 */
function NextClassPanel({
  next,
  academyZone,
}: {
  next: NextClass | null;
  academyZone: string;
}) {
  const viewerZone = useViewerTimeZone() ?? academyZone;

  if (!next) {
    return (
      <PortalCard>
        <div className="flex items-start gap-3">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-text-3" strokeWidth={1.7} />
          <div>
            <p className="text-sm font-medium">No tenés clases próximas</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Cuando la academia cargue el cronograma de tu camada, tu próxima
              clase y su enlace aparecen acá.
            </p>
          </div>
        </div>
      </PortalCard>
    );
  }

  const cuando = next.startsAt ?? next.date;

  return (
    <PortalCard className="border-brand-soft bg-brand-tint">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-text">
            {next.live ? "Tu clase está pasando" : "Tu próxima clase"}
          </p>
          <p className="text-lg font-semibold tracking-tight">{next.courseName}</p>

          {/*
            El día CONCRETO y la hora, y recién después el "en 5 días". Al
            revés —que fue el primer intento— el alumno lee "en 5 días" y
            todavía no sabe qué día es: tiene que contar.
          */}
          {/*
            `first-letter` va en el párrafo y no en el `span`: la
            pseudo-clase solo aplica a elementos de bloque, y en un `span`
            no emite nada — el día quedaba en minúscula.
          */}
          <p className="text-sm text-text-2 first-letter:uppercase">
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

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-text-3">
            <span className="rounded-full border border-brand-soft px-2 py-0.5 font-medium text-brand-text">
              {next.live ? "en curso" : relativeDay(cuando, viewerZone)}
            </span>
            {next.teacherName && (
              <span className="inline-flex items-center gap-1">
                <UserRound className="h-3.5 w-3.5" strokeWidth={1.7} />
                {next.teacherName}
              </span>
            )}
            {next.classroom && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" strokeWidth={1.7} />
                {next.classroom}
              </span>
            )}
          </div>
        </div>

        {/*
          FR-003 de 013 — El enlace aparece SOLO dentro de la ventana de la
          organización. Cuando no está, se dice cuándo va a estar en vez de
          dejar un botón muerto: un enlace visible todo el día invita a entrar
          a una sala vacía.
        */}
        {next.meetingUrl ? (
          <a
            href={next.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-on-accent shadow-sm transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
    </PortalCard>
  );
}

/* ============================================================
 * Lo que necesita atención — y solo cuando lo necesita
 * ============================================================ */

/**
 * Las alertas aparecen cuando son ciertas y desaparecen cuando no.
 *
 * No es un panel fijo con "todo en orden": un cartel permanente deja de
 * leerse a la tercera visita, y entonces el día que diga algo real tampoco se
 * va a leer. US3 pide justamente esto — enterarse de que está en riesgo
 * ANTES de que sea tarde.
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
    <section className="space-y-2">
      <SectionTitle>Para resolver</SectionTitle>
      <ul className="space-y-2">
        {avisos.map((a) => (
          <li
            key={a.key}
            className="flex items-start gap-2.5 rounded-lg border border-warning-border bg-warning-soft p-3.5"
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
    </section>
  );
}

/* ============================================================
 * US1, US3, US4 — Cómo voy en cada curso
 * ============================================================ */

function CourseCard({ course }: { course: Course }) {
  const obligatorias = course.assessments.filter((a) => a.required);
  const aprobadas = obligatorias.filter((a) => a.passed === true).length;
  const pendientes = obligatorias.filter((a) => a.passed === null).length;

  return (
    <PortalCard>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/portal/cursadas/${course.enrollmentId}`}
            className="text-base font-semibold tracking-tight underline-offset-4 hover:underline"
          >
            {course.courseName}
          </Link>
          <p className="mt-0.5 truncate text-sm text-text-3">
            {course.cohortName}
            {course.teacherName && ` · ${course.teacherName}`}
          </p>
        </div>
        <ApprovalBadge value={course.approval} />
      </div>

      {course.frequency && (
        <p className="mt-2 text-xs text-text-3">{course.frequency}</p>
      )}

      <div className="mt-4">
        <AttendanceBar
          pct={course.attendancePct}
          min={course.minAttendancePct}
          attended={course.attendedCount}
          eligible={course.eligibleCount}
        />
      </div>

      {obligatorias.length > 0 && (
        <p className="mt-3 text-sm text-text-2">
          <span className="font-medium tabular-nums">
            {aprobadas} de {obligatorias.length}
          </span>{" "}
          {obligatorias.length === 1 ? "evaluación aprobada" : "evaluaciones aprobadas"}
          {/* FR-005 — sin corregir es PENDIENTE, jamás desaprobada. */}
          {pendientes > 0 &&
            ` · ${pendientes} ${pendientes === 1 ? "sin corregir" : "sin corregir"}`}
        </p>
      )}

      {course.approval === "sin_datos" && (
        <p className="mt-3 text-sm text-text-3">{course.approvalReasons[0]}</p>
      )}
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
function LicenseCard({ license }: { license: License & { curso: string } }) {
  const vencida = license.daysLeft !== null && license.daysLeft < 0;

  return (
    <PortalCard>
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-text-3" strokeWidth={1.7} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{license.softwareName}</p>
          <p className="text-xs text-text-3">para {license.curso}</p>

          {license.assigned ? (
            <p className="mt-2 text-sm text-text-2">
              {license.assignedAt && <>Desde el {formatDate(license.assignedAt)}. </>}
              {license.expiresAt ? (
                <>
                  {vencida ? "Venció" : "Vence"} el {formatDate(license.expiresAt)}
                  {!vencida &&
                    license.daysLeft !== null &&
                    ` · quedan ${license.daysLeft} ${license.daysLeft === 1 ? "día" : "días"}`}
                  .
                </>
              ) : (
                "Sin fecha de vencimiento cargada."
              )}
            </p>
          ) : (
            <p className="mt-2 text-sm text-text-2">
              En trámite. Cuando la academia te la asigne vas a ver acá desde
              cuándo y hasta cuándo la tenés.
            </p>
          )}
        </div>
      </div>
    </PortalCard>
  );
}

/* ============================================================
 * US7 — Mi estado de cuenta
 * ============================================================ */

/**
 * DV-002 — La deuda se muestra aunque esté vencida. Ocultarla no la hace
 * desaparecer: solo garantiza la llamada.
 *
 * **Nunca se suman monedas distintas** (corrección del ciclo 007): un alumno
 * que pagó parte en guaraníes y parte en dólares ve dos totales, no uno
 * inventado.
 */
function BalancePanel({ balances }: { balances: Balance[] }) {
  if (balances.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <SectionTitle>Mi cuenta</SectionTitle>
        <Link
          href="/portal/cuenta"
          className="text-xs font-medium text-brand-text underline-offset-4 hover:underline"
        >
          Ver cuotas y pagos
        </Link>
      </div>

      {/*
        Una sola moneda ocupa el ancho: en dos columnas quedaba una tarjeta a
        media página con un hueco al lado, que se lee como algo que falta
        cargar. La grilla aparece recién cuando hay de qué comparar.
      */}
      <div className={cn("grid gap-3", balances.length > 1 && "sm:grid-cols-2")}>
        {balances.map((b) => (
          <PortalCard key={b.currency}>
            <div className="flex items-start gap-3">
              <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-text-3" strokeWidth={1.7} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text-3">
                  Saldo{balances.length > 1 && ` en ${b.currency}`}
                </p>
                <p
                  className={cn(
                    "text-xl font-semibold tabular-nums",
                    b.overdueCount > 0 && "text-danger"
                  )}
                >
                  {formatAmount(b.balance, b.currency)}
                </p>
                <p className="mt-1 text-xs text-text-3">
                  Pagaste {formatAmount(b.paid, b.currency)} de{" "}
                  {formatAmount(b.total, b.currency)}
                </p>
                {b.overdueCount > 0 ? (
                  <p className="mt-1 text-xs font-medium text-danger">
                    {b.overdueCount} {b.overdueCount === 1 ? "cuota vencida" : "cuotas vencidas"}
                  </p>
                ) : b.nextDueDate ? (
                  <p className="mt-1 text-xs text-text-3">
                    Próximo vencimiento: {formatDate(b.nextDueDate)}
                  </p>
                ) : b.balance === 0 ? (
                  <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-success">
                    <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2} /> Al día
                  </p>
                ) : null}
              </div>
            </div>
          </PortalCard>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
 * US6 — Mi certificado
 * ============================================================ */

function CertificateRow({
  cert,
}: {
  cert: { code: string; issuedAt: string; revokedAt: string | null; curso: string };
}) {
  const anulado = cert.revokedAt !== null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <Award
          className={`h-5 w-5 shrink-0 ${anulado ? "text-text-4" : "text-brand"}`}
          strokeWidth={1.7}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{cert.curso}</p>
          <p className="text-xs text-text-3">
            Emitido el {formatDate(cert.issuedAt)} · código{" "}
            <span className="font-mono">{cert.code}</span>
          </p>
        </div>
      </div>
      {/* FR-009 — un certificado anulado se ve, pero no se ofrece. */}
      {anulado ? (
        <span className="text-xs font-medium text-danger">Anulado</span>
      ) : (
        <Link
          href={`/verificar/${cert.code}`}
          className="inline-flex h-9 items-center rounded-md border border-input px-3 text-xs font-medium transition-colors hover:bg-accent"
        >
          Ver y compartir
        </Link>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-36 w-full" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
