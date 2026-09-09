"use client";

import { useEffect, useMemo, useState } from "react";
import type { CohortDto, CourseDto, SoftwareDto, TeacherDto } from "@/lib/types";
import { cn, WEEKDAY_LABELS } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

/** 023 — Lo mínimo del aula para poder elegirla: nombre e id. */
type RoomOption = { id: string; name: string };

function toDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

/**
 * 005 (T014, US1, FR-005) — alta/edición de una cohorte con toda la
 * información operativa: costo, horario, aula, temario, software y
 * profesor. `initial` presente = edición (PATCH); ausente = alta (POST).
 */
export function CohortForm({
  courses,
  teachers,
  software,
  cohorts,
  initial,
  onClose,
  onSaved,
  onTeacherCreated,
}: {
  courses: CourseDto[];
  teachers: TeacherDto[];
  software: SoftwareDto[];
  /** 028 — Todas las camadas cargadas, para poder elegir la padre. */
  cohorts: CohortDto[];
  initial?: CohortDto | null;
  onClose: () => void;
  onSaved: () => void;
  onTeacherCreated: (teacher: TeacherDto) => void;
}) {
  const [courseId, setCourseId] = useState(initial?.courseId ?? courses[0]?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [startDate, setStartDate] = useState(toDateInput(initial?.startDate ?? null));
  const [endDate, setEndDate] = useState(toDateInput(initial?.endDate ?? null));
  const [teacherId, setTeacherId] = useState(initial?.teacher?.id ?? "");
  const [cost, setCost] = useState(initial?.cost?.toString() ?? "");
  const [frequency, setFrequency] = useState(initial?.frequency ?? "");
  const [startTime, setStartTime] = useState(initial?.startTime ?? "");
  const [endTime, setEndTime] = useState(initial?.endTime ?? "");
  // 005 iteración 4 — días de la semana en que dicta, para el calendario
  // semanal (feedback en vivo: antes no existía, la cohorte aparecía todos
  // los días del rango). Índices 0=lunes..6=domingo.
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    initial?.daysOfWeek ? initial.daysOfWeek.split(",").map(Number) : []
  );
  const [classroom, setClassroom] = useState(initial?.classroom ?? "");
  /**
   * 023 — Las aulas se piden acá y no vienen del padre: el formulario es lo
   * único que las necesita, y bajarlas siempre encarecería la pantalla de
   * gestión entera para una lista de cinco que casi nunca cambia.
   */
  const [virtualRoomId, setVirtualRoomId] = useState(initial?.virtualRoomId ?? "");
  /**
   * 025 — El enlace de la reunión RECURRENTE. La columna existe desde la 013 y
   * nunca tuvo formulario: por eso las 41 cohortes reales la tienen vacía.
   */
  const [meetingUrl, setMeetingUrl] = useState(initial?.meetingUrl ?? "");
  const [rooms, setRooms] = useState<RoomOption[]>([]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/virtual-rooms").catch(() => null);
      if (!res?.ok) return;
      const body = (await res.json()) as { rooms: RoomOption[] };
      setRooms(body.rooms);
    })();
  }, []);
  const [capacity, setCapacity] = useState(initial?.capacity?.toString() ?? "");
  /**
   * 009/010 — mínimo de asistencia para aprobar. Vacío = hereda el del curso.
   * Sin esto cargado, la regla de aprobación solo mira las evaluaciones.
   */
  const [minAttendancePct, setMinAttendancePct] = useState(
    initial?.minAttendancePct?.toString() ?? ""
  );
  /**
   * 007 — El enlace del grupo ya se guardaba (columna `whatsapp_group_link`,
   * 005) pero no había dónde cargarlo: quedaba solo para el seed y ninguna
   * pantalla lo pedía. Es por cohorte y no por curso porque cada edición
   * tiene su propio grupo.
   */
  const [whatsappGroupLink, setWhatsappGroupLink] = useState(
    initial?.whatsappGroupLink ?? ""
  );
  const [softwareIds, setSoftwareIds] = useState<string[]>(
    initial?.software.map((s) => s.id) ?? []
  );
  /**
   * 028 fase 4 (FR-001/FR-002) — Armar la especialización: de qué camada es
   * módulo esta cohorte, y en qué lugar.
   *
   * Vacío = cohorte suelta, que es el estado de las 33 simples y lo que sigue
   * pasando si nadie toca nada (FR-032). Colgar y descolgar son la misma
   * operación con distinto valor, y la regla del árbol —un solo nivel, nadie
   * es su propio padre— la aplica `verificarPadreDeCohorte` en el servidor: el
   * formulario ofrece, no valida.
   */
  const [parentCohortId, setParentCohortId] = useState(initial?.parentCohortId ?? "");
  const [position, setPosition] = useState(initial?.position?.toString() ?? "");
  const [newTeacherName, setNewTeacherName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 005 (US4/US5, FR-006/FR-008) — advertencias no bloqueantes que devuelve
  // la API tras guardar (licencias insuficientes / choque de horario del
  // profesor). La cohorte ya quedó guardada; esto solo informa.
  const [warnings, setWarnings] = useState<string[] | null>(null);

  // 005 iteración 2 — filtra el selector de profesor por el curso elegido
  // (teacher_course, feedback en vivo del dueño). Si ninguno dicta ESE curso
  // todavía, mostramos la lista completa igual (mejor de más que bloquear).
  const teachersForCourse = useMemo(() => {
    if (!courseId) return teachers;
    const specific = teachers.filter((t) => t.courseIds.includes(courseId));
    return specific.length > 0 ? specific : teachers;
  }, [teachers, courseId]);
  const noSpecificTeachers =
    Boolean(courseId) &&
    teachers.length > 0 &&
    !teachers.some((t) => t.courseIds.includes(courseId));

  async function addTeacher() {
    const teacherName = newTeacherName.trim();
    if (!teacherName) return;
    const res = await fetch("/api/teachers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: teacherName }),
    }).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { teacher: TeacherDto };
    onTeacherCreated(data.teacher);
    setTeacherId(data.teacher.id);
    setNewTeacherName("");
  }

  function toggleSoftware(id: string) {
    setSoftwareIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  function toggleDay(day: number) {
    setDaysOfWeek((prev) =>
      (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]).sort()
    );
  }

  async function submit() {
    if (!courseId || !startDate) {
      setError("Curso y fecha de inicio son obligatorios");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      courseId,
      name: name.trim() || null,
      startDate,
      endDate: endDate || null,
      teacherId: teacherId || null,
      cost: cost.trim() ? Number(cost) : null,
      frequency: frequency.trim() || null,
      startTime: startTime || null,
      endTime: endTime || null,
      daysOfWeek: daysOfWeek.length > 0 ? daysOfWeek.join(",") : null,
      classroom: classroom.trim() || null,
      meetingUrl: meetingUrl.trim() || null,
      // Cadena vacía = "sin aula", y eso se manda como null: el schema del
      // servidor acepta null y rechaza el string vacío.
      virtualRoomId: virtualRoomId || null,
      capacity: capacity.trim() ? Number(capacity) : null,
      whatsappGroupLink: whatsappGroupLink.trim() || null,
      minAttendancePct: minAttendancePct.trim() ? Number(minAttendancePct) : null,
      // 028 — Cadena vacía = "no es módulo de nada", y se manda null explícito
      // para poder DESCOLGAR: omitirlo dejaría el padre como está.
      parentCohortId: parentCohortId || null,
      position: parentCohortId && position.trim() ? Number(position) : null,
      softwareIds,
    };
    const res = await fetch(
      initial ? `/api/cohorts/${initial.id}` : "/api/cohorts",
      {
        method: initial ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }
    ).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(body?.error?.message ?? "No se pudo guardar la cohorte");
      return;
    }

    const body = (await res.json().catch(() => null)) as {
      licenseWarnings?: { softwareName: string; capacity: number; available: number }[];
      scheduleWarnings?: { courseName: string; startDate: string; endDate: string | null }[];
    } | null;
    const messages = [
      ...(body?.licenseWarnings ?? []).map(
        (w) =>
          `Licencias insuficientes de ${w.softwareName}: cupo ${w.capacity}, disponibles ${w.available}.`
      ),
      ...(body?.scheduleWarnings ?? []).map(
        (w) =>
          `El profesor ya tiene "${w.courseName}" en un horario que se superpone (${toDateInput(w.startDate)} → ${w.endDate ? toDateInput(w.endDate) : "en curso"}).`
      ),
    ];
    if (messages.length > 0) {
      setWarnings(messages);
      return; // la cohorte ya está guardada; el usuario cierra el aviso para continuar.
    }
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 font-semibold">
          {initial ? "Editar cohorte" : "Nueva cohorte"}
        </h3>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cohort-course">Curso</Label>
            <select
              id="cohort-course"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
            >
              <option value="" disabled>
                Elegí un curso…
              </option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cohort-name">Nombre de la cohorte</Label>
            <Input
              id="cohort-name"
              placeholder="Revit Arquitectura 4 — dejalo vacío para usar el nombre del curso"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cohort-start">Fecha de inicio</Label>
              <Input
                id="cohort-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cohort-end">Fecha de fin</Label>
              <Input
                id="cohort-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cohort-teacher">Profesor</Label>
            <div className="flex gap-2">
              <select
                id="cohort-teacher"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value)}
              >
                <option value="">Sin asignar</option>
                {teachersForCourse.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            {noSpecificTeachers && (
              <p className="text-xs text-muted-foreground">
                Ningún profesor tiene este curso asignado todavía — mostrando
                todos.
              </p>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="Nombre de un profesor nuevo…"
                value={newTeacherName}
                onChange={(e) => setNewTeacherName(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!newTeacherName.trim()}
                onClick={() => void addTeacher()}
              >
                Agregar
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cohort-cost">Costo</Label>
              <Input
                id="cohort-cost"
                type="number"
                min={0}
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cohort-capacity">Cupo</Label>
              <Input
                id="cohort-capacity"
                type="number"
                min={0}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </div>
          </div>

          {/*
            028 fase 4 (US3) — Armar la especialización. Va junto al mínimo de
            asistencia porque las dos son decisiones de la ESTRUCTURA de la
            cursada, no del calendario ni de la venta.
          */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cohort-parent">Módulo de la especialización</Label>
              <Select
                id="cohort-parent"
                value={parentCohortId}
                onChange={(e) => setParentCohortId(e.target.value)}
              >
                <option value="">No es un módulo</option>
                {cohorts
                  // Un módulo no tiene sub-módulos y nadie es su propio padre
                  // (FR-003/FR-004): se filtran acá para no ofrecer lo que el
                  // servidor va a rechazar. La regla sigue siendo del servidor.
                  .filter((c) => c.parentCohortId === null && c.id !== initial?.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name ?? c.courseName}
                    </option>
                  ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                Elegí la camada de la que esta cohorte es un módulo. Vacío = cohorte
                suelta.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cohort-position">Orden dentro del programa</Label>
              <Input
                id="cohort-position"
                type="number"
                min={0}
                disabled={!parentCohortId}
                placeholder="10, 20, 30…"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Ordena los módulos; no es el número que se muestra. Podés dejar huecos
                (10, 20, 30) para insertar uno en el medio más adelante.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cohort-minasist">Asistencia mínima para aprobar (%)</Label>
            <Input
              id="cohort-minasist"
              type="number"
              min={0}
              max={100}
              placeholder="vacío = el del curso"
              value={minAttendancePct}
              onChange={(e) => setMinAttendancePct(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cohort-whatsapp">Grupo de WhatsApp</Label>
            <Input
              id="cohort-whatsapp"
              placeholder="https://chat.whatsapp.com/…"
              value={whatsappGroupLink}
              onChange={(e) => setWhatsappGroupLink(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Enlace de invitación al grupo de esta cohorte.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cohort-frequency">Horario</Label>
            <Input
              id="cohort-frequency"
              placeholder="ej. lunes y miércoles 18:30-20:30"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cohort-start-time">Hora de inicio</Label>
              <Input
                id="cohort-start-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cohort-end-time">Hora de fin</Label>
              <Input
                id="cohort-end-time"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Días de la semana</Label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_LABELS.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={cn(
                    "flex h-7 w-9 items-center justify-center rounded border text-xs font-medium transition-colors",
                    daysOfWeek.includes(i)
                      ? "border-brand bg-brand-tint text-brand-text"
                      : "border-input text-muted-foreground hover:bg-accent"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Sin días marcados, la cohorte se muestra en TODOS los días entre
              inicio y fin en el calendario.
            </p>
          </div>

          {/*
            023 — Ahora hay DOS aulas y decirle "Aula" a las dos garantiza que
            alguien cargue el Zoom en la física. La de siempre pasa a llamarse
            por lo que es.
          */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cohort-classroom">Aula física</Label>
              <Input
                id="cohort-classroom"
                placeholder="Aula 3"
                value={classroom}
                onChange={(e) => setClassroom(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cohort-room">Aula virtual</Label>
              <Select
                id="cohort-room"
                value={virtualRoomId}
                onChange={(e) => setVirtualRoomId(e.target.value)}
              >
                <option value="">Sin aula asignada</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                {rooms.length === 0
                  ? "Cargá tus cuentas de Zoom en la pestaña Aulas."
                  : "La CUENTA que ocupa. Sirve para avisarte si dos cohortes se pisan."}
              </p>
            </div>
          </div>

          {/*
            025 — El enlace que ve el alumno, y va en la COHORTE.

            La academia crea una reunión recurrente por cohorte, así que cada
            una tiene su propia URL aunque comparta cuenta de Zoom con otra.
            Ponerlo en el aula hacía que dos cohortes de la misma cuenta
            compartieran sala, y un alumno podía entrar a la clase de la otra.

            La columna existe desde la 013 y nunca tuvo formulario: por eso
            las 41 cohortes reales la tienen vacía.
          */}
          <div className="space-y-1.5">
            <Label htmlFor="cohort-meeting">Enlace de la reunión</Label>
            <Input
              id="cohort-meeting"
              type="url"
              placeholder="https://zoom.us/j/..."
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              El de la reunión recurrente de ESTA cohorte. Es lo que ve el
              alumno, y solo dentro del horario de su clase.
            </p>
          </div>
          {/* 006 — el temario dejó de editarse acá: es del curso, no de la
              edición. La cohorte lo hereda de su curso. */}

          <div className="space-y-1.5">
            <Label>Software</Label>
            <div className="flex flex-wrap gap-3">
              {software.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Sin software cargado todavía.
                </p>
              )}
              {software.map((s) => (
                <label key={s.id} className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={softwareIds.includes(s.id)}
                    onChange={() => toggleSoftware(s.id)}
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

        {warnings && (
          <div className="mt-3 space-y-1 rounded-md border border-warning-border bg-warning-soft p-3 text-xs text-warning">
            <p className="font-medium">
              La cohorte se guardó, pero revisá lo siguiente:
            </p>
            <ul className="list-disc space-y-0.5 pl-4">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          {warnings ? (
            <Button onClick={onSaved}>Entendido</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button disabled={saving} onClick={() => void submit()}>
                {saving ? "Guardando…" : "Guardar"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
