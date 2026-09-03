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
  AttendanceBar,
  ClassTime,
  EmptyNote,
  PortalCard,
  SectionTitle,
  formatDate,
} from "@/components/portal/student-bits";
import type { ApprovalValue } from "@/components/portal/student-bits";

/**
 * 015 (US1, US3, US4) — Una cursada del alumno, en detalle.
 *
 * Tres preguntas, en este orden: cómo voy, qué clases hubo y cómo me fue en
 * cada una, y qué evaluaciones tengo. Nada de compañeros: ni nombres, ni
 * notas, ni asistencia ajena (FR-002). No es un filtro de pantalla — esos
 * datos no salen del servidor.
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
    minAttendancePct: number | null;
    approval: ApprovalValue;
    approvalReasons: string[];
    assessments: { name: string; required: boolean; passed: boolean | null }[];
    certificate: { code: string; issuedAt: string; revokedAt: string | null } | null;
  };
  timezone: string;
  classes: ClassRow[];
  announcements: { id: string; title: string; body: string; authorName: string | null; createdAt: string }[];
  resources: { id: string; title: string; url: string; kind: string }[];
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

export function StudentCourseClient({ enrollmentId }: { enrollmentId: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <div className="space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { course } = data;
  const dictadas = data.classes.filter((c) => !c.canceled);

  return (
    <div className="space-y-8">
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

      <PortalCard>
        <SectionTitle>Mi asistencia</SectionTitle>
        <div className="mt-3">
          <AttendanceBar
            pct={course.attendancePct}
            min={course.minAttendancePct}
            attended={course.attendedCount}
            eligible={course.eligibleCount}
          />
        </div>
        {course.approvalReasons.length > 0 && (
          <ul className="mt-3 space-y-1">
            {course.approvalReasons.map((r) => (
              <li key={r} className="text-sm text-text-3">
                {r}
              </li>
            ))}
          </ul>
        )}
      </PortalCard>

      {data.announcements.length > 0 && (
        <section className="space-y-3">
          <SectionTitle>Avisos de la cohorte</SectionTitle>
          <div className="space-y-3">
            {data.announcements.map((a) => (
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
        </section>
      )}

      {data.resources.length > 0 && (
        <section className="space-y-3">
          <SectionTitle>Material del curso</SectionTitle>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {data.resources.map((r) => (
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
        </section>
      )}

      {course.assessments.length > 0 && (
        <section className="space-y-3">
          <SectionTitle>Mis evaluaciones</SectionTitle>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {course.assessments.map((a) => (
              <li
                key={a.name}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{a.name}</span>
                  {!a.required && (
                    <span className="text-xs text-text-3">No obligatoria</span>
                  )}
                </span>
                {/*
                  FR-005 — sin corregir se muestra PENDIENTE, jamás
                  desaprobada. Marcar como reprobado a quien todavía no fue
                  evaluado es acusarlo de algo que no pasó.
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
        </section>
      )}

      <section className="space-y-3">
        <SectionTitle>Mis clases</SectionTitle>
        {data.classes.length === 0 ? (
          <EmptyNote title="Esta cursada todavía no tiene cronograma">
            Cuando la academia lo genere vas a ver acá cada clase, su tema y tu
            asistencia.
          </EmptyNote>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {data.classes.map((c) => (
              <ClassRowItem key={c.id ?? c.number} row={c} academyZone={data.timezone} />
            ))}
          </ul>
        )}
        {dictadas.length !== data.classes.length && (
          <p className="text-xs text-text-3">
            Las clases canceladas no cuentan para tu porcentaje de asistencia.
          </p>
        )}
      </section>

      {course.certificate && !course.certificate.revokedAt && (
        <section className="space-y-3">
          <SectionTitle>Mi certificado</SectionTitle>
          <PortalCard className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                Emitido el {formatDate(course.certificate.issuedAt)}
              </p>
              <p className="text-xs text-text-3">
                Código <span className="font-mono">{course.certificate.code}</span>
              </p>
            </div>
            <Link
              href={`/verificar/${course.certificate.code}`}
              className="inline-flex h-10 items-center rounded-md border border-input px-4 text-sm font-medium transition-colors hover:bg-accent"
            >
              Ver y compartir
            </Link>
          </PortalCard>
        </section>
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

