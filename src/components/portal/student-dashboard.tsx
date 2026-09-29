"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
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
import {
  ChipDeEstado,
  EncabezadoDePagina,
  EnlaceBoton,
  Metrica,
  ProgresoDeClases,
  Tarjeta,
  TituloDeSeccion,
} from "@/components/portal/campus";

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
 * Mundo "campus" — La pantalla usa el ancho completo. Arriba, lado a lado, la
 * próxima clase (lo que más se pregunta) y el avance del curso al que
 * pertenece; debajo, los otros cursos activos en grilla, y al final la cuenta,
 * la licencia y los certificados. Cada curso aparece UNA vez: el que tiene la
 * próxima clase ya está arriba y no se repite en la grilla.
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
   * La próxima clase va arriba, a todo el ancho: es la pregunta que más veces
   * por semana interrumpe a coordinación. Sin clase en agenda, la tarjeta
   * habla del primer curso activo. Debajo, TODOS los cursos activos en una
   * sola grilla: ninguna tarjeta se estira para igualar la altura de otra.
   */
  const principal =
    activos.find((c) => c.enrollmentId === data.nextClass?.enrollmentId) ?? activos[0] ?? null;
  const next = principal && data.nextClass?.enrollmentId === principal.enrollmentId ? data.nextClass : null;

  return (
    <div className="space-y-8">
      <EncabezadoDePagina
        migas={[{ label: "Inicio", href: null }]}
        titulo={`Hola, ${nombreCorto}`}
        descripcion={
          activos.length > 0
            ? `Estás cursando ${activos.length} ${activos.length === 1 ? "curso" : "cursos"}.`
            : "No tenés cursos activos."
        }
      />

      <Alertas courses={data.courses} balances={data.balances} />

      {principal && <ProximaClase course={principal} next={next} academyZone={data.timezone} />}

      {activos.length > 0 ? (
        <section className="space-y-4">
          <TituloDeSeccion>Mis cursos</TituloDeSeccion>
          <div className="grid gap-6 md:grid-cols-2 2xl:grid-cols-3">
            {activos.map((c) => (
              <ResumenDeCurso
                key={c.enrollmentId}
                course={c}
                next={c.enrollmentId === principal?.enrollmentId ? next : null}
              />
            ))}
          </div>
        </section>
      ) : (
        data.courses.length > 0 && (
          <SinCursosActivos cursados={cerrados.length} certificados={certificados.length} />
        )
      )}

      <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
        <section className="flex flex-col gap-4">
          <TituloDeSeccion
            aside={
              data.balances.length > 0 && (
                <Link
                  href="/portal/cuenta"
                  className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand-text hover:underline"
                >
                  Cuotas y pagos
                  <ChevronRight className="h-4 w-4" strokeWidth={2} />
                </Link>
              )
            }
          >
            Estado de cuenta
          </TituloDeSeccion>
          <BalanceCard balances={data.balances} />
        </section>
        {licencias.length > 0 && (
          <section className="flex flex-col gap-4">
            <TituloDeSeccion>Mi licencia</TituloDeSeccion>
            <LicenseCard license={licencias[0]!} extra={licencias.length - 1} />
          </section>
        )}
        {certificados.length > 0 && (
          <section className="flex flex-col gap-4">
            <TituloDeSeccion
              aside={
                <Link
                  href="/portal/certificados"
                  className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand-text hover:underline"
                >
                  Ver todos
                  <ChevronRight className="h-4 w-4" strokeWidth={2} />
                </Link>
              }
            >
              Mis certificados
            </TituloDeSeccion>
            <div className="flex flex-1 flex-col gap-3">
              {certificados.slice(0, 3).map((c) => (
                <CertificateCard key={c.code} cert={c} />
              ))}
            </div>
          </section>
        )}
      </div>

      {cerrados.length > 0 && (
        <section className="space-y-4">
          <TituloDeSeccion>Cursos finalizados · {cerrados.length}</TituloDeSeccion>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            {cerrados.map((c) => (
              <li key={c.enrollmentId}>
                <Link
                  href={`/portal/cursadas/${c.enrollmentId}`}
                  className="flex min-h-[60px] items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{c.courseName}</span>
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
 * US2 — La próxima clase
 * ============================================================ */

/**
 * La próxima clase, a la escala de la pregunta: la hora es lo más grande de la
 * pantalla, y el botón para entrar está al lado.
 *
 * El enlace aparece SOLO dentro de la ventana de la organización (FR-003 de
 * 013): 15 minutos antes, 30 después. Cuando no está, la tarjeta dice CUÁNDO
 * va a estar en vez de dejar un botón muerto — un enlace visible todo el día
 * invita a entrar a una sala vacía.
 */
function ProximaClase({
  course,
  next,
  academyZone,
}: {
  course: Course;
  next: NextClass | null;
  academyZone: string;
}) {
  const viewerZone = useViewerTimeZone();
  const zona = viewerZone ?? academyZone;
  const completa = course.totalClasses > 0 && course.completedClasses >= course.totalClasses;

  if (!next) {
    return (
      <Tarjeta className="flex flex-col justify-center gap-3">
        <div className="flex items-center gap-3 text-text-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary">
            <CalendarClock className="h-5 w-5" strokeWidth={1.7} />
          </span>
          <p className="text-sm font-medium">Próxima clase</p>
        </div>
        <p className="text-2xl font-bold tracking-tight">
          {completa ? "Clases finalizadas" : "Sin clases programadas"}
        </p>
        <p className="max-w-prose text-sm text-text-2">
          {completa
            ? `Se dictaron las ${course.totalClasses} clases del cronograma. Tu asistencia figura en el resumen; los requisitos pendientes para finalizar el curso, en «Tu recorrido».`
            : course.totalClasses > 0
              ? // Hay cronograma, pero ninguna clase por delante tiene fecha confirmada.
                "Las próximas clases aún no tienen fecha confirmada. La fecha y el enlace de acceso se publicarán aquí."
              : "Cuando la academia publique el cronograma de tu cohorte, aquí verás la próxima clase y su enlace de acceso."}
        </p>
      </Tarjeta>
    );
  }

  const cuando = next.startsAt ?? next.date;
  const distinta = viewerZone !== null && viewerZone !== academyZone;
  const hora = next.startsAt
    ? next.endsAt
      ? `${formatHour(next.startsAt, zona)} – ${formatHour(next.endsAt, zona)}`
      : formatHour(next.startsAt, zona)
    : null;

  return (
    <Tarjeta
      aria-labelledby="proxima-clase"
      className={cn("border-brand-soft bg-brand-tint", next.live && "ring-2 ring-brand")}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-8">
        <div className="min-w-0 space-y-2 lg:w-[21rem] lg:shrink-0">
          {next.live ? (
            <ChipDeEstado tono="atencion">
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-danger" />
              </span>
              En vivo
            </ChipDeEstado>
          ) : (
            <ChipDeEstado tono="curso" className="first-letter:uppercase">
              {relativeDay(cuando, zona)}
            </ChipDeEstado>
          )}
          <p className="text-lg font-semibold first-letter:uppercase">{formatDay(cuando, zona)}</p>
          <p className="text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">
            {hora ?? "Sin horario"}
          </p>
          {distinta && next.startsAt && (
            <p className="text-xs text-text-3">
              Hora local. En {zoneLabel(academyZone)}: {formatHour(next.startsAt, academyZone)}.
            </p>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2 lg:border-l lg:border-brand-soft lg:pl-8">
          <h2 id="proxima-clase" className="text-sm font-medium text-text-2">
            {next.live ? "Clase en curso" : "Próxima clase"} · {next.courseName}
          </h2>
          <p className="text-lg font-semibold leading-snug">
            Clase {next.number}
            {next.topic && <span className="font-normal text-text-2"> · {next.topic}</span>}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-3">
            {next.teacherName && (
              <span className="inline-flex items-center gap-1.5">
                <UserRound className="h-4 w-4" strokeWidth={1.7} />
                {next.teacherName}
              </span>
            )}
            {next.classroom && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" strokeWidth={1.7} />
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
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-6 text-base font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Video className="h-5 w-5" strokeWidth={2} />
            Ingresar a la clase
          </a>
        ) : (
          <p className="inline-flex max-w-[16rem] shrink-0 items-start gap-2 rounded-md bg-card px-3 py-2 text-sm text-text-2">
            <Video className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.7} />
            El enlace de acceso se habilita 15 minutos antes del inicio.
          </p>
        )}
      </div>
    </Tarjeta>
  );
}

/* ============================================================
 * US1, US3, US4 — Cómo voy en cada curso
 * ============================================================ */

/**
 * El resumen de un curso: su estado, el progreso clase por clase y las
 * lecturas con su condición al lado. Un 50% no dice nada sin el mínimo, y
 * "1 de 2" no dice nada sin saber que la otra todavía no se corrigió.
 */
function ResumenDeCurso({
  course,
  next,
}: {
  course: Course;
  next: NextClass | null;
}) {
  const obligatorias = course.assessments.filter((a) => a.required);
  const aprobadas = obligatorias.filter((a) => a.passed === true).length;
  const pendientes = obligatorias.filter((a) => a.passed === null).length;
  const debajoDelMinimo =
    course.attendancePct !== null &&
    course.minAttendancePct !== null &&
    course.attendancePct < course.minAttendancePct;

  return (
    <Tarjeta as="article" className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-balance text-lg font-semibold leading-snug tracking-tight">
            {course.courseName}
          </h2>
          <p className="mt-0.5 truncate text-sm text-text-3">
            {[course.teacherName, course.cohortName].filter(Boolean).join(" · ")}
          </p>
        </div>
        <ApprovalBadge value={course.approval} />
      </div>

      {course.totalClasses > 0 ? (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold">
              Clase {course.completedClasses} de {course.totalClasses}
            </span>
            <span className="text-text-3">
              {course.completedClasses >= course.totalClasses
                ? "completo"
                : `faltan ${course.totalClasses - course.completedClasses}`}
            </span>
          </div>
          <ProgresoDeClases
            total={course.totalClasses}
            done={course.completedClasses}
            next={next?.number ?? null}
          />
        </div>
      ) : (
        <p className="text-sm text-text-3">Sin cronograma cargado.</p>
      )}

      {/*
        028 (US3) — La especialización muestra sus MÓDULOS, no un par de números
        agregados. No existe "la asistencia de la especialización": cada módulo
        tiene su cronograma y su propio mínimo, y promediarlos inventaría un
        criterio que nadie decidió.
      */}
      {course.modules ? (
        <ModulesList modules={course.modules} />
      ) : (
        <div className="grid grid-cols-2 gap-4 rounded-md bg-secondary p-4">
          {course.attendancePct === null ? (
            <Metrica etiqueta="Asistencia" valor="—" nota="sin registrar" />
          ) : (
            <Metrica
              etiqueta="Asistencia"
              valor={`${course.attendancePct}%`}
              alerta={debajoDelMinimo}
              nota={
                <>
                  {course.attendedCount} de {course.eligibleCount}
                  {course.minAttendancePct !== null && ` · mín. ${course.minAttendancePct}%`}
                </>
              }
            />
          )}
          {obligatorias.length === 0 ? (
            <Metrica etiqueta="Evaluaciones" valor="—" nota="sin cargar" />
          ) : (
            <Metrica
              etiqueta="Evaluaciones"
              valor={`${aprobadas} / ${obligatorias.length}`}
              // FR-005 — sin corregir es PENDIENTE, jamás desaprobada.
              nota={pendientes > 0 ? `${pendientes} sin corregir` : "todas corregidas"}
            />
          )}
        </div>
      )}

      {debajoDelMinimo && (
        <p className="text-sm text-danger">
          Tu asistencia está por debajo del mínimo para aprobar.
        </p>
      )}
      {course.approval === "sin_datos" && course.approvalReasons[0] && (
        <p className="text-sm text-text-3">{course.approvalReasons[0]}</p>
      )}

      <div className="mt-auto">
        <EnlaceBoton href={`/portal/cursadas/${course.enrollmentId}`} className="w-full sm:w-auto">
          Ver curso
          <ArrowRight className="h-4 w-4" strokeWidth={2} />
        </EnlaceBoton>
      </div>
    </Tarjeta>
  );
}

/* ============================================================
 * 028 (US3, US4) — Los módulos de una especialización
 * ============================================================ */

/**
 * Los módulos en orden de `position`, cada uno con su estado.
 *
 * Tres reglas que no son de estilo:
 *
 * - **Un módulo sin cronograma se muestra igual, declarándolo.** Ocultarlo es
 *   de donde vienen los 0 `class_session` de las camadas reales: un módulo
 *   invisible es un módulo que nadie carga.
 * - **El módulo cursado con otra cohorte lo dice** (US4). Es el hecho que el
 *   ciclo existe para poder representar; esconderlo lo desperdicia.
 * - **`sin_datos` no se dibuja como aprobado.** `ApprovalBadge` ya separa los
 *   cuatro estados, y por eso se reusa en vez de inventar un cartel nuevo.
 */
function ModulesList({ modules }: { modules: Module[] }) {
  return (
    <ol className="divide-y divide-border overflow-hidden rounded-md border border-border">
      {modules.map((m, i) => (
        <li key={m.enrollmentId} className="flex items-center gap-3 px-3 py-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-tint text-xs font-bold tabular-nums text-brand-text">
            {m.position ?? i + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{m.cohortName}</span>
            <span className="block truncate text-xs text-text-3">
              {m.sinCronograma
                ? "Sin cronograma"
                : `${m.completedClasses} de ${m.totalClasses} clases`}
              {m.attendancePct !== null && ` · ${m.attendancePct}% de asistencia`}
              {m.otraCamada && ` · cursado con ${m.camadaName ? `la cohorte ${m.camadaName}` : "otra cohorte"}`}
            </span>
          </span>
          <ApprovalBadge value={m.approval} />
        </li>
      ))}
    </ol>
  );
}

/**
 * Quien ya no cursa nada no ve un hueco: ve lo que ya hizo. Solo se dicen
 * cosas que el sistema sabe — cuántos cursos cerró y cuántos certificados
 * tiene.
 */
function SinCursosActivos({ cursados, certificados }: { cursados: number; certificados: number }) {
  return (
    <Tarjeta className="flex flex-col gap-2">
      <p className="text-2xl font-bold tracking-tight">Sin cursos activos</p>
      <p className="max-w-prose text-sm text-text-2">
        {cursados > 0 &&
          `Finalizaste ${cursados} ${cursados === 1 ? "curso" : "cursos"}${certificados > 0 ? ` y tenés ${certificados} ${certificados === 1 ? "certificado" : "certificados"}` : ""}. `}
        Cuando te inscribas en un nuevo curso, aparecerá aquí.
      </p>
    </Tarjeta>
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
    /*
      La asistencia del curso debajo del mínimo NO se repite acá: cada curso
      activo tiene su tarjeta en "Mis cursos", y ahí la lectura ya va en rojo,
      junto al mínimo. Un aviso aparte decía lo mismo dos veces.
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
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" strokeWidth={2} />
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
                  "text-3xl font-bold tabular-nums tracking-tight",
                  b.overdueCount > 0 && "text-danger"
                )}
              >
                {formatAmount(b.balance, b.currency)}
              </p>
              <p className="text-sm font-medium text-text-3">
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
          license.assigned ? "bg-brand-tint text-brand-text" : "bg-secondary text-text-3"
        )}
      >
        <KeyRound className="h-5 w-5" strokeWidth={1.7} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-lg font-semibold leading-tight tracking-tight">
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
        <ChipDeEstado tono="atencion">Anulado</ChipDeEstado>
      </PortalCard>
    );
  }

  return (
    <PortalCard className="flex items-center justify-between gap-4 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand-text">
          <Award className="h-5 w-5" strokeWidth={1.7} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{cert.curso}</p>
          <p className="truncate text-xs text-text-3">
            {formatDate(cert.issuedAt)} · <span className="font-mono">{cert.code}</span>
          </p>
        </div>
      </div>
      <Link
        href={`/verificar/${cert.code}`}
        className="inline-flex min-h-9 shrink-0 items-center rounded-md border border-border-strong px-3 text-sm font-semibold transition-colors hover:bg-accent"
      >
        Ver
      </Link>
    </PortalCard>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-16 w-80" />
      <Skeleton className="h-44 w-full rounded-lg" />
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-72 w-full rounded-lg" />
        <Skeleton className="h-72 w-full rounded-lg" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-44 w-full rounded-lg" />
        <Skeleton className="h-44 w-full rounded-lg" />
      </div>
    </div>
  );
}
