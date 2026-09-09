"use client";

import { useCallback, useEffect, useState } from "react";
import { Award, Copy, Plus } from "lucide-react";
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

type Assessment = { id: string; name: string; position: number; required: boolean };
type State = "aprobado" | "reprobado" | "pendiente";

type Student = {
  enrollmentId: string;
  contactName: string;
  results: Record<string, boolean | null>;
  attendancePct: number | null;
  state: State;
  reasons: string[];
  certificate: { code: string; issuedAt: string; revokedAt: string | null } | null;
};

type Sheet = {
  assessments: Assessment[];
  minAttendancePct: number | null;
  students: Student[];
};

/** 014 — Lo mínimo del listado de cohortes para poder elegir el origen. */
type CohortOption = { id: string; name: string; courseId: string; courseName: string };

const STATE_BADGE: Record<State, { label: string; variant: "success" | "destructive" | "warning" }> = {
  aprobado: { label: "Aprobado", variant: "success" },
  reprobado: { label: "Reprobado", variant: "destructive" },
  pendiente: { label: "Pendiente", variant: "warning" },
};

/**
 * 010 — Planilla de evaluación de la cohorte.
 *
 * La escala es aprobado / no aprobado (DV-001), así que cada celda es un
 * selector de tres estados: aprobó, no aprobó, o sin corregir. El vacío NO es
 * un reprobado (FR-005) y por eso tiene su propia opción visible.
 *
 * 014 (T016, DV-009) — Se suma copiar las evaluaciones de otra cohorte. Sin
 * eso, las 41 cohortes nacen vacías y el profesor —que no puede crearlas
 * (DV-002)— abre una pantalla sin nada.
 */
export function GradingClient({
  cohortId,
  canEdit,
}: {
  cohortId: string;
  /** 014 — `evaluacion.editar`. Sin esto la planilla se ve, no se toca. */
  canEdit: boolean;
}) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [origenes, setOrigenes] = useState<CohortOption[] | null>(null);
  const [origenId, setOrigenId] = useState("");
  const [copiando, setCopiando] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/cohorts/${cohortId}/grading`).catch(() => null);
    if (res?.ok) setSheet((await res.json()) as Sheet);
    setLoading(false);
  }, [cohortId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  /**
   * El listado de cohortes exige `academico.ver`, que es una capacidad
   * distinta de `evaluacion.editar`. Si no alcanza, se cae en silencio y la
   * acción de copiar simplemente no aparece: mejor que un botón que va a
   * devolver 403.
   */
  useEffect(() => {
    if (!canEdit) return;
    void (async () => {
      const res = await fetch("/api/cohorts").catch(() => null);
      if (!res?.ok) return;
      const body = (await res.json().catch(() => null)) as
        | { cohorts?: CohortOption[] }
        | null;
      const todas = body?.cohorts ?? [];
      // Las del MISMO curso primero: es de donde se copia el 99% de las veces,
      // y con 41 cohortes en la lista buscar a mano es un impuesto tonto.
      const cursoActual = todas.find((c) => c.id === cohortId)?.courseId;
      setOrigenes(
        todas
          .filter((c) => c.id !== cohortId)
          .sort(
            (a, b) =>
              Number(b.courseId === cursoActual) - Number(a.courseId === cursoActual)
          )
      );
    })();
  }, [canEdit, cohortId]);

  /** 014 (T016) — Copia el esquema de otra cohorte. Nunca los resultados. */
  async function copiarDesde() {
    if (!origenId) return;
    setCopiando(true);
    const res = await fetch(`/api/cohorts/${cohortId}/assessments/copy`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fromCohortId: origenId }),
    }).catch(() => null);
    setCopiando(false);

    if (!res?.ok) {
      setAviso(null);
      setError(await readError(res, "No se pudieron copiar las evaluaciones"));
      return;
    }

    const data = (await res.json()) as {
      copiadas: number;
      omitidas: string[];
      aviso: string | null;
    };
    setError(null);
    // El servidor ya explicó por qué no copió nada; cuando SÍ copió, el número
    // y lo que se salteó importan tanto como el éxito.
    setAviso(
      data.aviso ??
        `Se copiaron ${data.copiadas} evaluaciones${
          data.omitidas.length > 0
            ? `. Ya estaban: ${data.omitidas.join(", ")}`
            : "."
        }`
    );
    void refetch();
  }

  async function readError(res: Response | null, fallback: string) {
    const body = (await res?.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    return body?.error?.message ?? fallback;
  }

  async function addAssessment() {
    if (!newName.trim()) return;
    const res = await fetch(`/api/cohorts/${cohortId}/grading`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    }).catch(() => null);
    setError(res?.ok ? null : await readError(res, "No se pudo crear la evaluación"));
    setNewName("");
    void refetch();
  }

  async function mark(assessmentId: string, enrollmentId: string, value: string) {
    const passed = value === "" ? null : value === "si";
    const res = await fetch(`/api/assessments/${assessmentId}/results`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ results: [{ enrollmentId, passed }] }),
    }).catch(() => null);
    setError(res?.ok ? null : await readError(res, "No se pudo guardar el resultado"));
    void refetch();
  }

  async function issue(enrollmentId: string) {
    setBusy(enrollmentId);
    const res = await fetch(`/api/enrollments/${enrollmentId}/certificate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }).catch(() => null);
    setBusy(null);
    setError(res?.ok ? null : await readError(res, "No se pudo emitir el certificado"));
    void refetch();
  }

  if (loading) {
    return (
      <div className="space-y-2 p-6">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (!sheet) {
    return <p className="p-6 text-sm text-muted-foreground">No se pudo cargar la evaluación.</p>;
  }

  return (
    <div className="space-y-3 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {sheet.assessments.length} evaluaciones ·{" "}
          {sheet.minAttendancePct === null
            ? "sin mínimo de asistencia"
            : `mínimo de asistencia ${sheet.minAttendancePct}%`}
        </p>
        {canEdit && (
          <div className="flex flex-wrap items-end gap-2">
            {/* 014 (T016) — Copiar el esquema de otra cohorte. Va al lado de
                "Agregar" porque son la misma decisión: de dónde salen las
                evaluaciones de esta cohorte. */}
            {origenes && origenes.length > 0 && (
              <>
                <Select
                  aria-label="Copiar evaluaciones de otra cohorte"
                  className="h-8 w-64 text-xs"
                  value={origenId}
                  onChange={(e) => setOrigenId(e.target.value)}
                >
                  <option value="">Copiar evaluaciones de…</option>
                  {origenes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.courseName} · {c.name}
                    </option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!origenId || copiando}
                  onClick={() => void copiarDesde()}
                >
                  <Copy className="h-4 w-4" /> {copiando ? "Copiando…" : "Copiar"}
                </Button>
              </>
            )}
            <Input
              placeholder="Nueva evaluación…"
              className="h-8 w-52"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addAssessment();
              }}
            />
            <Button size="sm" disabled={!newName.trim()} onClick={() => void addAssessment()}>
              <Plus className="h-4 w-4" /> Agregar
            </Button>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      {aviso && <p className="text-xs text-muted-foreground">{aviso}</p>}

      {sheet.assessments.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {canEdit ? (
            <>
              Sin evaluaciones todavía. Agregá la primera arriba — por ejemplo
              &quot;Trabajo final&quot;
              {origenes && origenes.length > 0
                ? ", o copiá las de otra cohorte del mismo curso."
                : "."}
              <span className="mt-2 block text-xs">
                Copiar no ata las dos cohortes: quedan independientes, así que
                cambiar éstas nunca toca las de la otra.
              </span>
            </>
          ) : (
            "Esta cohorte todavía no tiene evaluaciones cargadas."
          )}
        </p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader className="bg-subtle">
              <TableRow>
                <TableHead>Alumno</TableHead>
                {sheet.assessments.map((a) => (
                  <TableHead key={a.id} className="text-center">
                    {a.name}
                    {!a.required && (
                      <span className="block text-[10px] font-normal">(opcional)</span>
                    )}
                  </TableHead>
                ))}
                <TableHead className="text-right">Asist.</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Certificado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sheet.students.map((st) => (
                <TableRow key={st.enrollmentId}>
                  <TableCell className="font-medium">{st.contactName}</TableCell>
                  {sheet.assessments.map((a) => {
                    const v = st.results[a.id];
                    return (
                      <TableCell key={a.id} className="p-1 text-center">
                        <Select
                          aria-label={`${st.contactName}, ${a.name}`}
                          className="h-7 w-20 px-1 text-xs"
                          disabled={!canEdit}
                          value={v === true ? "si" : v === false ? "no" : ""}
                          onChange={(e) => void mark(a.id, st.enrollmentId, e.target.value)}
                        >
                          <option value="">—</option>
                          <option value="si">Aprobó</option>
                          <option value="no">No</option>
                        </Select>
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right text-xs">
                    {st.attendancePct === null ? "—" : `${st.attendancePct}%`}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATE_BADGE[st.state].variant}>
                      {STATE_BADGE[st.state].label}
                    </Badge>
                    {st.reasons.length > 0 && (
                      <span className="block text-[10px] text-muted-foreground">
                        {st.reasons.join(" · ")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {st.certificate ? (
                      <a
                        href={`/api/enrollments/${st.enrollmentId}/certificate/print`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                        title={st.certificate.code}
                      >
                        {st.certificate.revokedAt ? "anulado" : "imprimir"}
                      </a>
                    ) : st.state === "aprobado" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === st.enrollmentId}
                        onClick={() => void issue(st.enrollmentId)}
                      >
                        <Award className="h-4 w-4" />
                        {busy === st.enrollmentId ? "Emitiendo…" : "Emitir"}
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Una evaluación sin corregir deja al alumno <strong>pendiente</strong>, nunca
        reprobado. El certificado se emite solo a los aprobados.
      </p>
    </div>
  );
}
