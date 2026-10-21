"use client";

import { useCallback, useEffect, useState } from "react";
import { Award, FileText, GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCalendarDay } from "@/lib/utils";
import { formatMinorNumber } from "@/lib/money";
import { EnrollLauncher } from "@/components/enrollments/enroll-launcher";
import { CancelEnrollmentAction } from "@/components/enrollments/cancel-enrollment";
import { AccessUntilLine, type EstadoDeAccesoDto } from "@/components/access/content-access";
import {
  ContactPortalAccess,
  DirectGrantsSection,
  type ContactGrantDto,
} from "@/components/access/direct-grants";

type RecordCourse = {
  enrollmentId: string;
  cohortId: string | null;
  cohortName: string;
  courseName: string;
  startDate: string | null;
  endDate: string | null;
  attendancePct: number | null;
  minAttendancePct: number | null;
  approval: "aprobado" | "reprobado" | "pendiente" | "sin_datos";
  approvalReasons: string[];
  assessments: { name: string; passed: boolean | null }[];
  certificate: { code: string; issuedAt: string; revokedAt: string | null } | null;
};

type StudentRecord = {
  contact: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    nationalId: string | null;
  };
  courses: RecordCourse[];
  account?: {
    currency: string;
    total: number;
    paid: number;
    balance: number;
    overdueCount: number;
  }[];
};

const APROBACION: Record<RecordCourse["approval"], { label: string; variant: "default" | "secondary" | "outline" }> = {
  aprobado: { label: "Aprobado", variant: "default" },
  reprobado: { label: "No aprobado", variant: "outline" },
  pendiente: { label: "En curso", variant: "secondary" },
  // 013 — Sin nada cargado no se afirma nada. Ver el comentario en
  // `student-record.ts`: decir "Aprobado" sin datos es inventar un hecho.
  sin_datos: { label: "Sin datos", variant: "outline" },
};

/**
 * 013 (T029, US6) — El legajo: todo el recorrido de una persona en una
 * pantalla.
 *
 * Es la pantalla que resume el cambio de CRM a academia. Un CRM muestra el
 * estado de una venta; una academia muestra el recorrido de una persona.
 *
 * **El estado de cuenta se dibuja solo si viene en la respuesta.** No hay un
 * `if (puedeVer)` acá: si la sesión no tiene `cobranza.ver`, el servidor NO
 * arma esa clave y los montos nunca salieron. Esconderlos en el navegador
 * sería habérselos mandado igual.
 */
export function StudentRecordClient({
  contactId,
  canEnroll = false,
  canPrintTranscript = false,
  canViewAccess = false,
  canEditAccess = false,
  canManagePortal = false,
}: {
  contactId: string;
  /** Resuelto en el servidor: `inscripciones.editar`. */
  canEnroll?: boolean;
  /**
   * 031 (T041) — Resuelto en el servidor: `academico.ver`, la capacidad de la
   * ruta de la escolaridad. Sin ella el enlace no se dibuja: llevaría a un 403.
   */
  canPrintTranscript?: boolean;
  /** 043 — `academico.ver` / `academico.editar` / `accesos.gestionar`, resueltas en el servidor. */
  canViewAccess?: boolean;
  canEditAccess?: boolean;
  canManagePortal?: boolean;
}) {
  const [data, setData] = useState<StudentRecord | null>(null);
  /** 043 — Acceso a contenidos: fechas por cursada y accesos directos. Ruta propia. */
  const [acceso, setAcceso] = useState<{
    enrollments: Map<string, EstadoDeAccesoDto>;
    grants: ContactGrantDto[];
  } | null>(null);
  const refetchAcceso = useCallback(async () => {
    if (!canViewAccess) return;
    const res = await fetch(`/api/contacts/${contactId}/content-access`).catch(() => null);
    if (!res?.ok) return;
    const body = (await res.json()) as { enrollments: EstadoDeAccesoDto[]; grants: ContactGrantDto[] };
    setAcceso({
      enrollments: new Map(body.enrollments.map((e) => [e.enrollmentId, e])),
      grants: body.grants,
    });
  }, [contactId, canViewAccess]);
  useEffect(() => {
    void refetchAcceso();
  }, [refetchAcceso]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/contacts/${contactId}/record`).catch(() => null);
    if (!res?.ok) {
      setError(res?.status === 404 ? "Contacto no encontrado" : "No se pudo cargar el legajo");
      setLoading(false);
      return;
    }
    setData((await res.json()) as StudentRecord);
    setLoading(false);
  }, [contactId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (loading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!data) {
    return <p className="p-6 text-sm text-muted-foreground">{error}</p>;
  }

  // Inicio y fin de la cursada: DÍAS (medianoche UTC), no instantes.
  const fecha = (iso: string | null) =>
    iso ? formatCalendarDay(iso, { day: "2-digit", month: "short", year: "numeric" }) : "—";

  return (
    <div className="space-y-6 p-6">
      {/* 2026-10-07 — El nombre, el correo y el teléfono ya los dice el
          encabezado de la página (`StudentHeader`). Acá queda lo que solo
          está en el legajo: la cédula, y la acción de inscribir. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {data.contact.nationalId ? (
            <>
              Documento: <span className="text-foreground">{data.contact.nationalId}</span>
            </>
          ) : (
            "Sin documento cargado"
          )}
        </p>
        {canPrintTranscript && data.courses.length > 0 && (
          /*
            031 (T041) — Descarga el PDF de la escolaridad directamente.
          */
          <a
            href={`/api/contacts/${contactId}/escolaridad/print`}
            download
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            <FileText className="h-4 w-4" aria-hidden />
            Descargar escolaridad
          </a>
        )}
        {canEnroll && (
          <EnrollLauncher
            className="flex flex-col items-end"
            initialContact={{ id: data.contact.id, name: data.contact.name }}
            onEnrolled={() => void refetch()}
          />
        )}
      </div>

      {/* Sin cursadas no hay sección: un lead todavía no cursó nada. */}
      {data.courses.length > 0 && (
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <GraduationCap className="h-4 w-4" />
          Cursadas ({data.courses.length})
        </h2>

        {data.courses.map((c) => (
          <article key={c.enrollmentId} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{c.cohortName}</p>
              <Badge variant={APROBACION[c.approval].variant}>
                {APROBACION[c.approval].label}
              </Badge>
              {c.certificate && !c.certificate.revokedAt && (
                <>
                  <Badge variant="secondary">
                    <Award className="mr-1 h-3 w-3" />
                    Certificado {c.certificate.code}
                  </Badge>
                  {/* 038 (FR-015) — el PDF con el diseño; un anulado no se descarga. */}
                  <a
                    href={`/api/certificates/${encodeURIComponent(c.certificate.code)}/pdf`}
                    download
                    className="text-xs font-medium text-brand-text hover:underline"
                  >
                    Descargar PDF
                  </a>
                </>
              )}
              {c.certificate?.revokedAt && (
                <Badge variant="outline">Certificado anulado</Badge>
              )}
            </div>

            <p className="mt-1 text-xs text-muted-foreground">
              {c.courseName} · {fecha(c.startDate)} – {fecha(c.endDate)}
            </p>

            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span>
                Asistencia:{" "}
                {c.attendancePct === null ? (
                  /* Sin clases registradas todavía: decirlo es más honesto que
                     mostrar 0%, que se lee como "no vino nunca". */
                  <span className="text-muted-foreground">sin clases registradas</span>
                ) : (
                  <>
                    <strong>{c.attendancePct}%</strong>
                    {c.minAttendancePct !== null && (
                      <span className="text-muted-foreground">
                        {" "}
                        (mínimo {c.minAttendancePct}%)
                      </span>
                    )}
                  </>
                )}
              </span>

              {c.assessments.length > 0 && (
                <span>
                  Evaluaciones:{" "}
                  {c.assessments
                    .map(
                      (a) =>
                        `${a.name}: ${a.passed === null ? "sin corregir" : a.passed ? "aprobó" : "no aprobó"}`
                    )
                    .join(" · ")}
                </span>
              )}
            </div>

            {c.approvalReasons.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {c.approvalReasons.join(" · ")}
              </p>
            )}

            {/* 043 — Hasta cuándo ve grabaciones, material y cursos offline. */}
            {acceso?.enrollments.has(c.enrollmentId) && (
              <div className="mt-3 border-t pt-3">
                <AccessUntilLine
                  estado={acceso.enrollments.get(c.enrollmentId)}
                  canEdit={canEditAccess}
                  onChanged={() => void refetchAcceso()}
                />
              </div>
            )}

            {/* Cancelar una inscripción hecha por error (`inscripciones.editar`). */}
            {canEnroll && c.cohortId && (
              <div className="mt-3 flex justify-end border-t pt-3">
                <CancelEnrollmentAction
                  enrollmentId={c.enrollmentId}
                  onCancelled={() => {
                    void refetch();
                    void refetchAcceso();
                  }}
                />
              </div>
            )}
          </article>
        ))}
      </section>
      )}

      {/* 043 — Accesos directos a cursos offline (sin inscripción). */}
      {acceso && (
        <DirectGrantsSection
          contactId={contactId}
          grants={acceso.grants}
          canEdit={canEditAccess}
          onChanged={() => void refetchAcceso()}
        />
      )}

      {/* 043 — Quien solo tiene accesos directos también entra al portal. */}
      {canManagePortal && data.courses.length === 0 && (acceso?.grants.some((g) => !g.revokedAt) ?? false) && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Acceso al portal
          </h2>
          <ContactPortalAccess contactId={contactId} />
        </section>
      )}

      {/* Solo existe si el servidor la mandó (FR-010). */}
      {data.account && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Estado de cuenta
          </h2>
          {data.account.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin plan de cuotas cargado.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.account.map((a) => (
                <li key={a.currency} className="flex flex-wrap gap-x-6">
                  <span className="font-medium">{a.currency}</span>
                  <span>Total: {formatMinorNumber(a.total, a.currency)}</span>
                  <span>Pagado: {formatMinorNumber(a.paid, a.currency)}</span>
                  <span className={a.balance > 0 ? "font-medium" : ""}>
                    Saldo: {formatMinorNumber(a.balance, a.currency)}
                  </span>
                  {a.overdueCount > 0 && (
                    <Badge variant="outline">
                      {a.overdueCount} {a.overdueCount === 1 ? "cuota vencida" : "cuotas vencidas"}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
