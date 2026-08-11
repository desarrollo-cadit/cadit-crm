"use client";

import { useState } from "react";
import type { CourseDto, TeacherDto } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 005 iteración 2 — alta/edición de un profesor desde la pestaña
 * "Profesores" de /academico: nombre, costo por hora y qué cursos dicta
 * (checkboxes sobre el catálogo, mismo patrón que el selector de software de
 * `CohortForm`). `POST /api/teachers` solo acepta `name` (ruta ya existente,
 * usada también por el alta rápida de `CohortForm`); costo/cursos se fijan
 * con un PATCH inmediato después de crear.
 */
export function TeacherForm({
  courses,
  initial,
  onClose,
  onSaved,
}: {
  courses: CourseDto[];
  initial?: TeacherDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [hourlyRate, setHourlyRate] = useState(initial?.hourlyRate?.toString() ?? "");
  const [courseIds, setCourseIds] = useState<string[]>(initial?.courseIds ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleCourse(id: string) {
    setCourseIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);

    const patchBody = {
      name: name.trim(),
      hourlyRate: hourlyRate.trim() ? Number(hourlyRate) : null,
      courseIds,
    };

    let res: Response | null;
    if (initial) {
      res = await fetch(`/api/teachers/${initial.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patchBody),
      }).catch(() => null);
    } else {
      const createRes = await fetch("/api/teachers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      }).catch(() => null);
      if (!createRes?.ok) {
        res = createRes;
      } else {
        const created = (await createRes.json()) as { teacher: TeacherDto };
        res = await fetch(`/api/teachers/${created.teacher.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            hourlyRate: hourlyRate.trim() ? Number(hourlyRate) : null,
            courseIds,
          }),
        }).catch(() => null);
      }
    }

    setSaving(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(body?.error?.message ?? "No se pudo guardar el profesor");
      return;
    }
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 font-semibold">
          {initial ? "Editar profesor" : "Nuevo profesor"}
        </h3>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="teacher-name">Nombre</Label>
            <Input id="teacher-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="teacher-rate">Costo por hora</Label>
            <Input
              id="teacher-rate"
              type="number"
              min={0}
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Cursos que dicta</Label>
            <div className="flex flex-wrap gap-3">
              {courses.length === 0 && (
                <p className="text-xs text-muted-foreground">Sin cursos cargados todavía.</p>
              )}
              {courses.map((c) => (
                <label key={c.id} className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={courseIds.includes(c.id)}
                    onChange={() => toggleCourse(c.id)}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
        </div>
        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
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
