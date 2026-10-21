"use client";

import { useState } from "react";
import type { CourseDto, TeacherDto } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notify } from "@/lib/notify";
import { Modal, useDirty } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";

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
  const [email, setEmail] = useState(initial?.email ?? "");
  /** 023 — Título profesional: sale al catálogo público con la foto. */
  const [title, setTitle] = useState(initial?.title ?? "");
  const [hourlyRate, setHourlyRate] = useState<number | null>(initial?.hourlyRate ?? null);
  const [courseIds, setCourseIds] = useState<string[]>(initial?.courseIds ?? []);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = useDirty({ name, email, title, hourlyRate, courseIds, photoFile });

  function toggleCourse(id: string) {
    setCourseIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  async function uploadPhoto(id: string) {
    if (!photoFile) return;
    const body = new FormData();
    body.append("file", photoFile);
    await fetch(`/api/teachers/${id}/photo`, { method: "PUT", body }).catch(() => null);
  }

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);

    const patchBody = {
      name: name.trim(),
      hourlyRate,
      email: email.trim() || null,
      title: title.trim() || null,
      courseIds,
    };

    let res: Response | null;
    let teacherId = initial?.id ?? null;
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
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
          title: title.trim() || null,
        }),
      }).catch(() => null);
      if (!createRes?.ok) {
        res = createRes;
      } else {
        const created = (await createRes.json()) as { teacher: TeacherDto };
        teacherId = created.teacher.id;
        res = await fetch(`/api/teachers/${created.teacher.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            hourlyRate,
            courseIds,
          }),
        }).catch(() => null);
      }
    }

    if (!res?.ok) {
      setSaving(false);
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      notify.error(body?.error?.message ?? "No se pudo guardar el profesor");
      return;
    }
    if (teacherId) await uploadPhoto(teacherId);
    setSaving(false);
    notify.success(initial ? "Profesor guardado." : "Profesor creado.");
    onSaved();
  }

  return (
    <Modal
      onClose={onClose}
      dirty={dirty}
      busy={saving}
      labelledBy="teacher-form-title"
      className="max-h-[90vh] overflow-y-auto"
    >
        <h3 id="teacher-form-title" className="mb-4 font-semibold">
          {initial ? "Editar profesor" : "Nuevo profesor"}
        </h3>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="teacher-name">Nombre</Label>
            <Input id="teacher-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="teacher-email">Email</Label>
            <Input
              id="teacher-email"
              type="email"
              placeholder="profesor@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="teacher-title">Título</Label>
            <Input
              id="teacher-title"
              placeholder="Arquitecto, Ingeniero Civil…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            {/* Se dice para qué sirve: sin esto parece un dato interno más y
                nadie lo carga. */}
            <p className="text-xs text-muted-foreground">
              Se muestra en la web, junto a la foto, en los grupos que dicta.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="teacher-rate">Costo por hora</Label>
            <MoneyInput id="teacher-rate" value={hourlyRate} onChange={setHourlyRate} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="teacher-photo">Foto (opcional)</Label>
            <div className="flex items-center gap-2.5">
              {initial?.hasPhoto && !photoFile && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/teachers/${initial.id}/photo`}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-full object-cover"
                />
              )}
              <Input
                id="teacher-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
              />
            </div>
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
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!name.trim() || saving} onClick={() => void submit()}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
    </Modal>
  );
}
