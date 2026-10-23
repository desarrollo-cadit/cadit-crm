"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { MAX_SIGUIENTES } from "@/lib/rutas-de-cursos";
import { notify } from "@/lib/notify";
import type { CourseDto } from "@/lib/types";

/**
 * 046 (US2; FR-005, FR-006) — Qué cursos se recomiendan después de este, y en
 * qué orden. Lo arma Coordinación: es una tabla curada, no un cálculo.
 *
 * Se guarda la lista ENTERA (reemplazo total) con su propio pedido, separado
 * del editor del curso. Quién puede guardar lo decide el servidor
 * (`academico.editar`); esta pantalla solo se ofrece a quien puede.
 */
export function NextCoursesDialog({
  course,
  courses,
  initial,
  onClose,
  onSaved,
}: {
  course: CourseDto;
  courses: CourseDto[];
  initial: string[];
  onClose: () => void;
  onSaved: (toCourseIds: string[]) => void;
}) {
  const [ids, setIds] = useState<string[]>(initial);
  const [elegido, setElegido] = useState("");
  const [saving, setSaving] = useState(false);

  const nombre = useMemo(() => new Map(courses.map((c) => [c.id, c.name])), [courses]);
  // Ni el propio curso, ni talleres, ni los que ya están en la lista.
  const disponibles = courses
    .filter((c) => c.id !== course.id && c.kind !== "taller" && !ids.includes(c.id))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const dirty = ids.join("|") !== initial.join("|");

  function mover(i: number, delta: -1 | 1) {
    setIds((prev) => {
      const next = [...prev];
      const j = i + delta;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }

  async function guardar() {
    setSaving(true);
    const res = await fetch(`/api/courses/${course.id}/next-courses`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nextCourseIds: ids }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      notify.error(body?.error?.message ?? "No se pudieron guardar los cursos siguientes.");
      return;
    }
    notify.success("Cursos siguientes guardados.");
    onSaved(((await res.json()) as { toCourseIds: string[] }).toCourseIds);
  }

  return (
    <Modal onClose={onClose} dirty={dirty} busy={saving} labelledBy="next-courses-title" className="max-w-lg">
      <h3 id="next-courses-title" className="font-semibold">
        Cursos siguientes de {course.name}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Se le sugieren a quien cursó {course.name}, en este orden, salvo los que ya hizo o en los que ya está
        inscripto.
      </p>

      <ol className="mt-4 space-y-2" aria-label="Cursos siguientes en orden">
        {ids.length === 0 ? (
          <li className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            Sin cursos siguientes todavía.
          </li>
        ) : (
          ids.map((id, i) => (
            <li key={id} className="flex items-center gap-2 rounded-md border bg-card px-3 py-2">
              <span className="w-5 text-xs text-muted-foreground">{i + 1}.</span>
              <span className="min-w-0 flex-1 truncate text-sm">{nombre.get(id) ?? "Curso borrado"}</span>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Subir ${nombre.get(id) ?? "curso"}`}
                disabled={i === 0}
                onClick={() => mover(i, -1)}
              >
                <ArrowUp className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Bajar ${nombre.get(id) ?? "curso"}`}
                disabled={i === ids.length - 1}
                onClick={() => mover(i, 1)}
              >
                <ArrowDown className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Quitar ${nombre.get(id) ?? "curso"}`}
                onClick={() => setIds((prev) => prev.filter((x) => x !== id))}
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          ))
        )}
      </ol>

      {ids.length < MAX_SIGUIENTES && (
        <div className="mt-4 flex items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="next-course-add">Agregar un curso</Label>
            <Select id="next-course-add" value={elegido} onChange={(e) => setElegido(e.target.value)}>
              <option value="">Elegí un curso…</option>
              {disponibles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <Button
            variant="outline"
            disabled={!elegido}
            onClick={() => {
              setIds((prev) => [...prev, elegido]);
              setElegido("");
            }}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Agregar
          </Button>
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={() => void guardar()} loading={saving} disabled={!dirty}>
          Guardar
        </Button>
      </div>
    </Modal>
  );
}
