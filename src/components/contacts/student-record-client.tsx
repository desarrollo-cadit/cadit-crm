"use client";

import { useCallback, useEffect, useState } from "react";
import { Award, GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

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
export function StudentRecordClient({ contactId }: { contactId: string }) {
  const [data, setData] = useState<StudentRecord | null>(null);
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

  const fecha = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("es-UY", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  return (
    <div className="space-y-6 p-6">
      <header>
        <h2 className="text-lg font-semibold">{data.contact.name}</h2>
        <p className="text-sm text-muted-foreground">
          {[data.contact.email, data.contact.phone, data.contact.nationalId]
            .filter(Boolean)
            .join(" · ") || "Sin datos de contacto"}
        </p>
      </header>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <GraduationCap className="h-4 w-4" />
          Cursadas ({data.courses.length})
        </h3>

        {data.courses.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Esta persona todavía no tiene ninguna inscripción.
          </p>
        )}

        {data.courses.map((c) => (
          <article key={c.enrollmentId} className="rounded-md border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{c.cohortName}</p>
              <Badge variant={APROBACION[c.approval].variant}>
                {APROBACION[c.approval].label}
              </Badge>
              {c.certificate && !c.certificate.revokedAt && (
                <Badge variant="secondary">
                  <Award className="mr-1 h-3 w-3" />
                  Certificado {c.certificate.code}
                </Badge>
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
          </article>
        ))}
      </section>

      {/* Solo existe si el servidor la mandó (FR-010). */}
      {data.account && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Estado de cuenta
          </h3>
          {data.account.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin plan de cuotas cargado.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.account.map((a) => (
                <li key={a.currency} className="flex flex-wrap gap-x-6">
                  <span className="font-medium">{a.currency}</span>
                  <span>Total: {a.total.toLocaleString("es-UY")}</span>
                  <span>Pagado: {a.paid.toLocaleString("es-UY")}</span>
                  <span className={a.balance > 0 ? "font-medium" : ""}>
                    Saldo: {a.balance.toLocaleString("es-UY")}
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
