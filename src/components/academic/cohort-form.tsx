"use client";

import { useMemo, useState } from "react";
import type { CohortDto, CourseDto, SoftwareDto, TeacherDto } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function toDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

/** 0=lunes..6=domingo — mismo orden que el calendario semanal. */
const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/**
 * 005 (T014, US1, FR-005) — alta/edición de una camada con toda la
 * información operativa: costo, horario, aula, temario, software y
 * profesor. `initial` presente = edición (PATCH); ausente = alta (POST).
 */
export function CohortForm({
  courses,
  teachers,
  software,
  initial,
  onClose,
  onSaved,
  onTeacherCreated,
}: {
  courses: CourseDto[];
  teachers: TeacherDto[];
  software: SoftwareDto[];
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
  // semanal (feedback en vivo: antes no existía, la camada aparecía todos
  // los días del rango). Índices 0=lunes..6=domingo.
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    initial?.daysOfWeek ? initial.daysOfWeek.split(",").map(Number) : []
  );
  const [classroom, setClassroom] = useState(initial?.classroom ?? "");
  const [syllabusUrl, setSyllabusUrl] = useState(initial?.syllabusUrl ?? "");
  const [capacity, setCapacity] = useState(initial?.capacity?.toString() ?? "");
  const [softwareIds, setSoftwareIds] = useState<string[]>(
    initial?.software.map((s) => s.id) ?? []
  );
  const [newTeacherName, setNewTeacherName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 005 (US4/US5, FR-006/FR-008) — advertencias no bloqueantes que devuelve
  // la API tras guardar (licencias insuficientes / choque de horario del
  // profesor). La camada ya quedó guardada; esto solo informa.
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
      syllabusUrl: syllabusUrl.trim() || null,
      capacity: capacity.trim() ? Number(capacity) : null,
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
      setError(body?.error?.message ?? "No se pudo guardar la camada");
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
      return; // la camada ya está guardada; el usuario cierra el aviso para continuar.
    }
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 font-semibold">
          {initial ? "Editar camada" : "Nueva camada"}
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
            <Label htmlFor="cohort-name">Nombre de la camada</Label>
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
              {DAY_LABELS.map((label, i) => (
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
              Sin días marcados, la camada se muestra en TODOS los días entre
              inicio y fin en el calendario.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cohort-classroom">Aula</Label>
              <Input
                id="cohort-classroom"
                value={classroom}
                onChange={(e) => setClassroom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cohort-syllabus">URL del temario</Label>
              <Input
                id="cohort-syllabus"
                value={syllabusUrl}
                onChange={(e) => setSyllabusUrl(e.target.value)}
              />
            </div>
          </div>

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
          <div className="mt-3 space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
            <p className="font-medium">
              La camada se guardó, pero revisá lo siguiente:
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

/**
 * Alta/edición de un curso (nombre + descripción). `initial` presente =
 * edición (PATCH `/api/courses/:id`); ausente = alta (POST `/api/courses`).
 * Antes solo existía el alta rápida — feedback en vivo: no había forma de
 * editar un curso ya creado ni de verlos listados fuera del selector de la
 * camada.
 */
export function CourseQuickForm({
  initial,
  onClose,
  onSaved,
}: {
  initial?: CourseDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    await fetch(initial ? `/api/courses/${initial.id}` : "/api/courses", {
      method: initial ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
    }).catch(() => null);
    setSaving(false);
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 font-semibold">{initial ? "Editar curso" : "Nuevo curso"}</h3>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="course-name">Nombre</Label>
            <Input id="course-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="course-description">Descripción</Label>
            <Textarea
              id="course-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!name.trim() || saving} onClick={() => void submit()}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
